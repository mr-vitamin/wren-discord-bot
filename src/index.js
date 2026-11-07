const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
  escapeMarkdown,
} = require('discord.js');
const {
  addSubmission,
  assignSubmission,
  loadSubmissions,
  markSubmission,
  saveSubmissions,
  submissionSummary,
} = require('./submissions');
const {
  contributorCommand, createResetLock, handleChoice, handleStaffCommand,
} = require('./contributor-discord');
const { loadIssue } = require('./contributor');

const ROOT = path.resolve(__dirname, '..');
const TOKEN_FILE = path.join(ROOT, 'token.dat');

const GUILD_ID = '1549421190609895557';
const COMMAND_CHANNEL_ID = '1549980714064412803';
const QUOTES_CHANNEL_ID = '1552648891445416067';
const STAFF_COMMAND_CHANNEL_ID = '1556325587432243281'; // private staff bot-coms
const SUBMISSIONS_FILE = path.join(ROOT, 'data', 'submissions.json');
const CONTRIBUTOR_ISSUE_FILE = path.join(ROOT, 'data', 'contributor-issue.json');
const FOX_ORANGE = 0xf97316;
const contributorResetLock = createResetLock();

function loadEncryptedToken() {
  if (!fs.existsSync(TOKEN_FILE)) {
    throw new Error('No encrypted token is configured. Run setup-token.ps1 first.');
  }

  const escapedPath = TOKEN_FILE.replace(/'/g, "''");
  const decryptScript = [
    'Add-Type -AssemblyName System.Security',
    `$cipher = [Convert]::FromBase64String([IO.File]::ReadAllText('${escapedPath}'))`,
    '$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)',
    'try { [Text.Encoding]::UTF8.GetString($plain) } finally { [Array]::Clear($plain, 0, $plain.Length) }',
  ].join('; ');

  const token = execFileSync(
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', decryptScript],
    { encoding: 'utf8', windowsHide: true },
  ).trim();

  if (!token) {
    throw new Error('The encrypted token could not be read. Run setup-token.ps1 again.');
  }

  return token;
}

const quoteCommand = new SlashCommandBuilder()
  .setName('quote')
  .setDescription('Send a clean quote to the quotes channel')
  .addStringOption((option) =>
    option
      .setName('quote')
      .setDescription('The quote text')
      .setRequired(true)
      .setMaxLength(1800),
  )
  .addUserOption((option) =>
    option
      .setName('speaker')
      .setDescription('Who said it')
      .setRequired(true),
  );

const submissionCommand = new SlashCommandBuilder()
  .setName('sub')
  .setDescription('Track the editorial status of submissions (staff only)')
  .addSubcommand((subcommand) =>
    subcommand.setName('add').setDescription('Add a piece to the editorial tracker')
      .addStringOption((option) => option.setName('title').setDescription('Piece title').setRequired(true).setMaxLength(120))
      .addUserOption((option) => option.setName('author').setDescription('Who submitted it').setRequired(true))
      .addStringOption((option) => option.setName('link').setDescription('Discord forum post link').setRequired(false)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('mark').setDescription('Update the editing status of a piece')
      .addStringOption((option) => option.setName('id').setDescription('Tracker ID, e.g. WP-001').setRequired(true))
      .addStringOption((option) => option.setName('status').setDescription('Current editorial state').setRequired(true)
        .addChoices(
          { name: 'Submitted — not yet edited', value: 'submitted' },
          { name: 'Editing — in progress', value: 'editing' },
          { name: 'Edited — pass complete', value: 'edited' },
        ))
      .addUserOption((option) => option.setName('editor').setDescription('Who is editing it').setRequired(false)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('list').setDescription('See who still needs editing')
      .addStringOption((option) => option.setName('filter').setDescription('Which pieces to show').setRequired(false)
        .addChoices(
          { name: 'Not yet edited', value: 'unedited' },
          { name: 'Edited', value: 'edited' },
          { name: 'All', value: 'all' },
        )),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('show').setDescription('View one tracked piece')
      .addStringOption((option) => option.setName('id').setDescription('Tracker ID, e.g. WP-001').setRequired(true)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('assign').setDescription('Assign or unassign an editor')
      .addStringOption((option) => option.setName('id').setDescription('Tracker ID, e.g. WP-001').setRequired(true))
      .addUserOption((option) => option.setName('editor').setDescription('Editor; leave empty to unassign').setRequired(false)),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('summary').setDescription('See editorial workload at a glance'),
  );

function validateForumLink(link) {
  if (!link) return null;
  let url;
  try { url = new URL(link); } catch { throw new Error('Use a full Discord forum post link.'); }
  if (url.protocol !== 'https:' || !['discord.com', 'www.discord.com'].includes(url.hostname)
    || !new RegExp(`^/channels/${GUILD_ID}/\\d+(?:/\\d+)?/?$`).test(url.pathname)) {
    throw new Error('The link must point to a post in this Discord server.');
  }
  return `https://discord.com${url.pathname.replace(/\/$/, '')}`;
}

function statusLabel(status) {
  return { submitted: '○ Submitted', editing: '◐ Editing', edited: '● Edited' }[status] || status;
}

async function handleSubmissionCommand(interaction) {
  if (interaction.guildId !== GUILD_ID || interaction.channelId !== STAFF_COMMAND_CHANNEL_ID) {
    await interaction.reply({ content: `Use /sub in <#${STAFF_COMMAND_CHANNEL_ID}>.`, flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    const records = loadSubmissions(SUBMISSIONS_FILE);
    const subcommand = interaction.options.getSubcommand();
    let content;

    if (subcommand === 'add') {
      const record = addSubmission(records, {
        title: interaction.options.getString('title', true),
        authorId: interaction.options.getUser('author', true).id,
        link: validateForumLink(interaction.options.getString('link')),
        submittedById: interaction.user.id,
      });
      saveSubmissions(SUBMISSIONS_FILE, records);
      content = `Tracking **${record.id}** — ${escapeMarkdown(record.title)} for <@${record.authorId}>. Status: ${statusLabel(record.status)}.`;
    } else if (subcommand === 'mark') {
      const record = markSubmission(
        records,
        interaction.options.getString('id', true),
        interaction.options.getString('status', true),
        interaction.options.getUser('editor')?.id,
      );
      saveSubmissions(SUBMISSIONS_FILE, records);
      content = `**${record.id}** — ${escapeMarkdown(record.title)} is now **${statusLabel(record.status)}**${record.editorId ? ` (editor: <@${record.editorId}>)` : ''}.`;
    } else if (subcommand === 'show') {
      const id = interaction.options.getString('id', true).trim().toLowerCase();
      const record = records.find((item) => item.id.toLowerCase() === id);
      if (!record) throw new Error(`No submission found for ${id}.`);
      content = `**${record.id} — ${escapeMarkdown(record.title)}**\nAuthor: <@${record.authorId}>\nStatus: ${statusLabel(record.status)}\nEditor: ${record.editorId ? `<@${record.editorId}>` : 'Not assigned'}${record.link ? `\nPost: ${record.link}` : ''}`;
    } else if (subcommand === 'assign') {
      const record = assignSubmission(records, interaction.options.getString('id', true), interaction.options.getUser('editor')?.id || null);
      saveSubmissions(SUBMISSIONS_FILE, records);
      content = `**${record.id}** — ${escapeMarkdown(record.title)}: ${record.editorId ? `assigned to <@${record.editorId}>` : 'editor unassigned'}.`;
    } else if (subcommand === 'summary') {
      const summary = submissionSummary(records);
      content = `**Editorial snapshot**\n○ Submitted: ${summary.submitted}\n◐ Editing: ${summary.editing}\n● Edited: ${summary.edited}\nNeeds an editor: ${summary.unassigned}\nTotal pieces: ${records.length}`;
    } else {
      const filter = interaction.options.getString('filter') || 'unedited';
      const selected = records.filter((record) => filter === 'all' || (filter === 'edited' ? record.status === 'edited' : record.status !== 'edited'));
      const header = `**Submissions — ${filter} (${selected.length})**`;
      const lines = [];
      for (const record of selected.slice().reverse()) {
        const line = `**${record.id}** ${statusLabel(record.status)} — ${escapeMarkdown(record.title)} (<@${record.authorId}>)`;
        if (header.length + lines.join('\n').length + line.length > 1800) break;
        lines.push(line);
      }
      content = `${header}\n${lines.length ? lines.join('\n') : 'Nothing to show.'}${selected.length > lines.length ? '\nShowing the most recent entries. Use /sub show for details.' : ''}`;
    }

    await interaction.reply({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('Submission command failed:', error);
    await interaction.reply({ content: error.message || 'Could not update the tracker.', flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
}

const token = loadEncryptedToken();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once(Events.ClientReady, async (readyClient) => {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(
    Routes.applicationGuildCommands(readyClient.user.id, GUILD_ID),
    { body: [quoteCommand.toJSON(), submissionCommand.toJSON(), contributorCommand.toJSON()] },
  );

  console.log(`Foxie is online as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('wren:contributor:')) {
    try {
      await handleChoice(interaction, loadIssue(CONTRIBUTOR_ISSUE_FILE), {
        file: CONTRIBUTOR_ISSUE_FILE, resetLock: contributorResetLock,
      });
    } catch (error) {
      console.error('Contributor interaction failed:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Participation is temporarily unavailable. Please contact staff.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
    return;
  }
  if (!interaction.isChatInputCommand()) {
    return;
  }

  if (interaction.commandName === 'contributor') {
    await handleStaffCommand(interaction, {
      file: CONTRIBUTOR_ISSUE_FILE, guildId: GUILD_ID,
      staffChannelId: STAFF_COMMAND_CHANNEL_ID, resetLock: contributorResetLock,
    });
    return;
  }

  if (interaction.commandName === 'sub') {
    await handleSubmissionCommand(interaction);
    return;
  }

  if (interaction.commandName !== 'quote') return;

  if (interaction.guildId !== GUILD_ID || interaction.channelId !== COMMAND_CHANNEL_ID) {
    await interaction.reply({
      content: `Use /quote in <#${COMMAND_CHANNEL_ID}>.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const rawQuote = interaction.options.getString('quote', true).trim();
    const speaker = interaction.options.getUser('speaker', true);
    const member = await interaction.guild.members.fetch(speaker.id).catch(() => null);
    const displayName = member?.displayName || speaker.globalName || speaker.displayName || speaker.username;

    const quoteText = escapeMarkdown(rawQuote, {
      bold: true,
      italic: true,
      underline: true,
      strikethrough: true,
      codeBlock: true,
      inlineCode: true,
      spoiler: true,
      heading: true,
      bulletedList: true,
      numberedList: true,
      maskedLink: true,
    });
    const speakerName = escapeMarkdown(displayName);

    const embed = new EmbedBuilder()
      .setColor(FOX_ORANGE)
      .setDescription(`❝  **${quoteText}**  ❞\n\n*— ${speakerName}*`);

    const quotesChannel = await interaction.guild.channels.fetch(QUOTES_CHANNEL_ID);
    if (!quotesChannel?.isTextBased()) {
      throw new Error('The configured quotes channel is unavailable.');
    }

    await quotesChannel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
    await interaction.editReply('Posted.');
  } catch (error) {
    console.error('Quote command failed:', error);
    await interaction.editReply('I could not post that quote. Please tell an admin.');
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

client.login(token).catch((error) => {
  console.error('Foxie could not log in:', error.message);
  process.exitCode = 1;
});
