const { PermissionFlagsBits } = require('discord.js');
function isStaff(interaction, guildId, channelId) {
  return interaction.guildId === guildId && interaction.channelId === channelId
    && Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles));
}
module.exports = { isStaff };
