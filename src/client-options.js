const { GatewayIntentBits, Options } = require('discord.js');
function createClientOptions() {
  return {
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings,
      MessageManager: 0, ReactionManager: 0, PresenceManager: 0,
      GuildMemberManager: { maxSize: 0, keepOverLimit: member => member.id === member.client.user?.id },
      UserManager: { maxSize: 0, keepOverLimit: user => user.id === user.client.user?.id },
    }),
  };
}
module.exports = { createClientOptions };
