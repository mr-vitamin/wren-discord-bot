const { randomBytes } = require('node:crypto');
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder, StringSelectMenuBuilder, escapeMarkdown,
} = require('discord.js');
const {
  changeParticipation, createResetLock, isCurrentControl, issueControlId,
  loadIssue, resetContributors, saveIssue,
} = require('./contributor');
const { log } = require('./safe-log');

const contributorCommand = new SlashCommandBuilder()
  .setName('contributor')
  .setDescription('Manage magazine issue participation (staff only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .setDMPermission(false)
  .addSubcommand((command) => command.setName('announce').setDescription('Post an issue announcement with participation choices')
    .addStringOption((option) => option.setName('issue').setDescription('Issue name, e.g. Issue #2').setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName('title').setDescription('Announcement title').setRequired(true).setMaxLength(256))
    .addStringOption((option) => option.setName('description').setDescription('Announcement description').setRequired(true).setMaxLength(4000))
    .addStringOption((option) => option.setName('message').setDescription('Main message shown above the announcement').setRequired(true).setMaxLength(2000))
    .addChannelOption((option) => option.setName('channel').setDescription('Where Wren should post the announcement').setRequired(true)
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
  .addSubcommand((command) => command.setName('close').setDescription('Close participation without removing Contributor'))
  .addSubcommand((command) => command.setName('reset').setDescription('Remove Contributor from all current members after confirmation'));

function buildMenu(issue) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(issueControlId(issue))
    .setPlaceholder(`${issue.issue.slice(0, 95)} — choose participation`)
    .setDisabled(!issue.enabled)
    .addOptions(
      { label: 'Participate', value: 'participate', description: 'Join this issue and open contributor feedback', emoji: '✒️' },
      { label: 'Withdraw', value: 'withdraw', description: 'Leave this issue and close contributor feedback', emoji: '↩️' },
    ));
}

function resolveContributorRole(guild) {
  const matches = [...guild.roles.cache.values()].filter((role) => role.name === 'Contributor');
  if (!matches.length) throw new Error('The existing Contributor role was not found.');
  if (matches.length > 1) throw new Error('More than one Contributor role exists; staff must resolve this before continuing.');
  return matches[0];
}

async function handleChoice(interaction, issue, { file, resetLock } = {}) {
  if (!isCurrentControl(issue, interaction.customId, interaction.channelId, interaction.message.id)) {
    if (interaction.deferred) await interaction.editReply({ content: 'Participation for this announcement is closed or outdated.' });
    else await interaction.reply({ content: 'Participation for this announcement is closed or outdated.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const operation = async () => {
      const current = file ? loadIssue(file) : issue;
      if (!isCurrentControl(current, interaction.customId, interaction.channelId, interaction.message.id)) return 'stale';
      const role = resolveContributorRole(interaction.guild);
      const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true, cache: false });
      if (!member) throw new Error('Your server membership could not be found.');
      return changeParticipation(member, role.id, interaction.values[0]);
    };
    const result = resetLock ? await resetLock.runParticipation(operation) : await operation();
    if (result === 'stale') {
      await interaction.editReply({ content: 'Participation for this announcement is closed or outdated.' });
      return;
    }
    const responses = {
      joined: `You are participating in ${issue.issue}. This is not a manuscript submission or publication acceptance.`,
      'already-joined': `You are already participating in ${issue.issue}.`,
      withdrawn: `You have withdrawn from ${issue.issue}.`,
      'already-withdrawn': `You are not currently participating in ${issue.issue}.`,
    };
    await interaction.editReply({ content: responses[result], allowedMentions: { parse: [] } });
  } catch (error) {
    log('participation_failed', error);
    await interaction.editReply({ content: /reset is in progress/i.test(error.message)
      ? 'A staff reset is in progress. Please try again afterward.'
      : 'I could not update your Contributor role. Please contact staff.' });
  }
}

async function disableAnnouncement(guild, issue) {
  if (!issue?.channelId || !issue?.messageId) return null;
  try {
    const channel = await guild.channels.fetch(issue.channelId);
    const message = await channel?.messages?.fetch(issue.messageId);
    if (!message || message.author.id !== guild.client.user.id) return 'The old announcement could not be edited; its dropdown is still invalid.';
    await message.edit({ components: [buildMenu({ ...issue, enabled: false })] });
    return null;
  } catch {
    return 'The old announcement could not be edited; its dropdown is still invalid.';
  }
}

async function handleStaffCommand(interaction, { file, guildId, staffChannelId, resetLock }) {
  if (interaction.guildId !== guildId || interaction.channelId !== staffChannelId
    || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: `Use this staff command in <#${staffChannelId}> with Manage Roles permission.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const action = interaction.options.getSubcommand();
  if (action === 'reset') {
    await confirmAndReset(interaction, { file, resetLock });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await resetLock.run(async () => {
      const current = loadIssue(file);
      if (action === 'announce') {
        if (current?.enabled) {
          await interaction.editReply({
            content: `Participation for **${escapeMarkdown(current.issue)}** is already open. Use \`/contributor close\` before announcing another issue. Closing preserves Contributor roles; use \`/contributor reset\` to clear them intentionally.`,
            allowedMentions: { parse: [] },
          });
          return;
        }
        resolveContributorRole(interaction.guild);
        const issueName = interaction.options.getString('issue', true).trim();
        const title = interaction.options.getString('title', true).trim();
        const description = interaction.options.getString('description', true).trim();
        const mainMessage = interaction.options.getString('message', true).trim();
        if (!issueName || !title || !description || !mainMessage) throw new Error('Announcement fields cannot be blank.');
        const channel = interaction.options.getChannel('channel', true);
        if (!channel?.send || channel.guildId !== interaction.guildId) throw new Error('Choose a text or announcement channel in this server.');
        const issue = { issue: issueName, channelId: channel.id, messageId: '', generation: randomBytes(12).toString('hex'), enabled: true };
        const embed = new EmbedBuilder().setColor(0x795744).setTitle(title).setDescription(description);
        const message = await channel.send({ content: mainMessage, embeds: [embed], components: [buildMenu(issue)], allowedMentions: { parse: [] } });
        issue.messageId = message.id;
        try {
          saveIssue(file, issue);
        } catch (error) {
          await message.edit({ components: [buildMenu({ ...issue, enabled: false })] }).catch(() => {});
          throw new Error(`The announcement was posted, but participation could not be saved. Its dropdown is inactive. Message: ${message.url}. ${error.message}`);
        }
        await interaction.editReply(`Posted the ${issueName} announcement with its participation dropdown: ${message.url}`);
      } else if (action === 'close') {
        if (!current?.enabled) throw new Error('No issue is currently open for participation.');
        const closed = { ...current, enabled: false, generation: randomBytes(12).toString('hex') };
        saveIssue(file, closed);
        const warning = await disableAnnouncement(interaction.guild, current);
        await interaction.editReply(`Participation for ${current.issue} is closed. Contributor roles were not removed.${warning ? ` ${warning}` : ''}`);
      }
    });
  } catch (error) {
    log('contributor_failed', error);
    await interaction.editReply('Could not update issue participation. Check the current issue state or contact the operator.');
  }
}

async function confirmAndReset(interaction, { file, resetLock }) {
  const nonce = randomBytes(8).toString('hex');
  const confirmId = `wren:reset:${interaction.user.id}:${nonce}`;
  const cancelId = `wren:cancel:${interaction.user.id}:${nonce}`;
  await interaction.reply({
    content: 'Remove Contributor from every current member and close the current issue? This cannot be undone automatically.',
    flags: MessageFlags.Ephemeral,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm reset').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    )],
  });
  let button;
  try {
    const reply = await interaction.fetchReply();
    button = await reply.awaitMessageComponent({ time: 60_000,
      filter: (event) => event.user.id === interaction.user.id && [confirmId, cancelId].includes(event.customId) });
  } catch {
    await interaction.editReply({ content: 'Reset confirmation expired. No roles were changed.', components: [] }).catch(() => {});
    return;
  }
  if (button.customId === cancelId) {
    await button.update({ content: 'Reset cancelled. No roles were changed.', components: [] });
    return;
  }
  if (!button.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await button.update({ content: 'Reset denied: Manage Roles permission is required.', components: [] });
    return;
  }
  await button.update({ content: 'Resetting Contributor roles. This may take a moment.', components: [] });
  try {
    const result = await resetLock.run(async () => {
      const member = await interaction.guild.members.fetch({ user: interaction.user.id, force: true, cache: false });
      const channel = await interaction.guild.channels.fetch(interaction.channelId);
      if (!channel?.permissionsFor(member)?.has(PermissionFlagsBits.ManageRoles)) {
        const denied = new Error('Staff authorization changed.'); denied.code = 'STAFF_AUTH_REQUIRED'; throw denied;
      }
      const current = loadIssue(file);
      if (current?.enabled) {
        saveIssue(file, { ...current, enabled: false, generation: randomBytes(12).toString('hex') });
      }
      const warning = await disableAnnouncement(interaction.guild, current);
      const role = resolveContributorRole(interaction.guild);
      const members = await interaction.guild.members.fetch();
      const counts = await resetContributors(members.values(), role.id);
      return { ...counts, warning };
    });
    await button.editReply({ content: `Contributor reset finished. Removed: ${result.removed}. Failed: ${result.failed}.${result.warning ? ` ${result.warning}` : ''}` });
  } catch (error) {
    log('reset_failed', error);
    await button.editReply({ content: error.code === 'STAFF_AUTH_REQUIRED'
      ? 'Reset denied: staff authorization changed.' : 'Contributor reset could not finish. Please contact the operator.' });
  }
}

module.exports = { contributorCommand, buildMenu, resolveContributorRole, handleChoice, handleStaffCommand, createResetLock };
