const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require('discord.js');

const helpCommand = new SlashCommandBuilder()
  .setName('help')
  .setDescription('List all Wren commands and their permission requirements');

const categories = {
  help: 'General',
  quote: 'Community',
  sub: 'Editorial Tracking',
  contributor: 'Issue Participation',
};

function buildHelpEmbed(commands, commandChannelId) {
  const definitions = commands.map(command => command.toJSON());
  const order = Object.keys(categories);
  definitions.sort((a, b) => {
    const rank = name => order.includes(name) ? order.indexOf(name) : order.length;
    return rank(a.name) - rank(b.name);
  });
  const fields = definitions.map(command => {
    const restricted = command.default_member_permissions != null;
    let access = 'Everyone can use this command.';
    if (restricted) {
      const permissions = new PermissionsBitField(BigInt(command.default_member_permissions))
        .toArray().map(name => name.replace(/([a-z])([A-Z])/g, '$1 $2'));
      access = `Requires **${permissions.join(', ') || 'Administrator'}** permission.`;
      if (['sub', 'contributor'].includes(command.name)) access += ' Use the configured staff command channel.';
    } else if (command.name === 'quote') {
      access = `Everyone; use in <#${commandChannelId}>.`;
    }
    const subcommands = command.options?.filter(option => option.type === 1) || [];
    const lines = (subcommands.length ? subcommands : [command]).map(item => {
      const name = subcommands.length ? `${command.name} ${item.name}` : command.name;
      return `\`/${name}\` — ${item.description}`;
    });
    return {
      name: `${categories[command.name] || command.name}${restricted ? ' — Staff only' : ''}`,
      value: `${access}\n\n${lines.join('\n')}`,
    };
  });
  return new EmbedBuilder()
    .setColor(0xa855f7)
    .setTitle('Wren Commands')
    .setURL('https://vtmnarchive.com/archive/wren-discord-bot')
    .setDescription('Browse all commands below, including staff commands.\n[Wren website](https://vtmnarchive.com/archive/wren-discord-bot)')
    .addFields(fields);
}

module.exports = { helpCommand, buildHelpEmbed };
