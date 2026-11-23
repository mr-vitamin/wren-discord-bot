const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits, ApplicationCommandOptionType } = require('discord.js');
const { contributorCommand, buildMenu, buildAnnouncementEmbed, buildAnnouncementPayload } = require('../src/contributor-discord');

test('announcement separates issue label, headline, flexible details, and participation guidance', () => {
  assert.equal(typeof buildAnnouncementEmbed, 'function', 'announcement presentation must be independently testable');
  const details = [
    '**Prompt:** An unexpected invitation',
    '**Categories:** Fiction, poetry, personal essays',
    '**Word limit:** Up to 1,500 words',
    '**Submission deadline:** <t:1893456000:F>',
    '**Release date:** To be announced',
  ].join('\n');
  const embed = buildAnnouncementEmbed({ issue: 'Spring Collection' }, 'Call for Contributions', details).toJSON();
  assert.equal(embed.color, 0xa855f7);
  assert.equal(embed.author.name, 'Spring Collection');
  assert.equal(embed.title, 'Call for Contributions');
  assert.equal(embed.description, details, 'staff Markdown and dates must remain intact');
  assert.equal(embed.fields.length, 1);
  assert.equal(embed.fields[0].name, 'Participation');
  assert.match(embed.fields[0].value, /Join this issue/);
  assert.match(embed.fields[0].value, /Withdraw from this issue/);
  assert.match(embed.fields[0].value, /Contributor role/);
  assert.match(embed.fields[0].value, /does not submit a manuscript or confirm acceptance/);
  assert.doesNotMatch(JSON.stringify(embed), /Wet Paper|Magazine|Issue #2/);
});

test('announcement accepts existing maximum-length inputs within Discord embed limits', () => {
  assert.equal(typeof buildAnnouncementEmbed, 'function', 'announcement builder is required');
  const embed = buildAnnouncementEmbed({ issue: 'I'.repeat(100) }, 'T'.repeat(256), 'D'.repeat(4000), {
    dates: 'X'.repeat(256), submission: 'S'.repeat(1024),
  });
  const json = embed.toJSON();
  assert.equal(json.author.name.length, 100);
  assert.equal(json.title.length, 256);
  assert.equal(json.description.length, 4000);
  assert.deepEqual(json.fields.map(field => field.name), ['Important Dates', 'How to Submit', 'Participation']);
  assert.ok(json.fields.every(field => field.value.length <= 1024));
  assert.ok(embed.length <= 6000);
});

test('participation menu is clear while retaining its identifiers, values, emojis, and enabled state', () => {
  const menu = buildMenu({ issue: 'Any community issue', generation: 'abc', enabled: true }).toJSON().components[0];
  assert.equal(menu.placeholder, 'Select your participation type...');
  assert.equal(menu.custom_id, 'wren:contributor:abc');
  assert.equal(menu.disabled, false);
  assert.deepEqual(menu.options.map(option => [option.label, option.value, option.description]), [
    ['Join this issue', 'participate', 'Receive the Contributor role to take part in this issue.'],
    ['Withdraw from this issue', 'withdraw', 'Remove the Contributor role and withdraw from this issue.'],
  ]);
  assert.deepEqual(menu.options.map(option => option.emoji.name), ['✒️', '↩️']);
  assert.equal(buildMenu({ generation: 'abc', enabled: false }).toJSON().components[0].disabled, true);
});

test('announcement retains existing option names and limits while making intro and new sections optional', () => {
  const command = contributorCommand.toJSON();
  assert.equal(BigInt(command.default_member_permissions), PermissionFlagsBits.ManageRoles);
  assert.equal(command.dm_permission, false);
  const options = command.options.find(option => option.name === 'announce').options;
  assert.deepEqual(options.map(option => [option.name, option.type, option.required, option.max_length]), [
    ['issue', ApplicationCommandOptionType.String, true, 100],
    ['title', ApplicationCommandOptionType.String, true, 256],
    ['description', ApplicationCommandOptionType.String, true, 4000],
    ['channel', ApplicationCommandOptionType.Channel, true, undefined],
    ['message', ApplicationCommandOptionType.String, false, 2000],
    ['dates', ApplicationCommandOptionType.String, false, 256],
    ['submission', ApplicationCommandOptionType.String, false, 1024],
  ]);
  const descriptions = Object.fromEntries(options.map(option => [option.name, option.description]));
  assert.match(descriptions.issue, /tracking label/i);
  assert.match(descriptions.issue, /e\.g\./);
  assert.match(descriptions.title, /embed headline/i);
  assert.match(descriptions.title, /e\.g\./);
  assert.match(descriptions.description, /embed body/i);
  for (const term of ['prompt', 'categories', 'word limits', 'Markdown']) {
    assert.ok(descriptions.description.includes(term), `missing description guidance: ${term}`);
  }
  assert.match(descriptions.message, /intro text.*above the embed/i);
  assert.match(descriptions.message, /optional/i);
  assert.match(descriptions.channel, /destination/i);
  assert.match(descriptions.channel, /#announcements/);
  assert.match(descriptions.dates, /deadlines.*release dates/i);
  assert.match(descriptions.submission, /How to Submit/);
  assert.deepEqual(options.find(option => option.name === 'channel').channel_types, [0, 5]);
  for (const option of options) assert.ok(option.description.length <= 100);
});

test('issue identification appears once when the headline already contains it', () => {
  for (const title of ['Spring Collection', 'SPRING COLLECTION — Call for Contributions', '**Spring Collection**: Join us']) {
    const embed = buildAnnouncementEmbed({ issue: 'Spring Collection' }, title, 'Editorial details.').toJSON();
    assert.equal(embed.author, undefined);
    assert.equal(embed.title, title);
  }
  assert.equal(buildAnnouncementEmbed({ issue: 'Issue 2' }, 'Issue 20 — Open call', 'Details').toJSON().author.name, 'Issue 2');
});

test('details remove duplicate leading identifiers and a separately headed participation block', () => {
  const body = [
    '# Spring Collection', '', 'Call for Contributions', '', '',
    '**Categories:** Fiction and poetry', '**Prompt:** Your chosen theme', '**Word limits:** Your limits', '',
    '## How to Participate', 'Old duplicate dropdown instructions.', '',
    '## Guidelines', 'Read [our guidelines](https://example.org/guidelines).',
  ].join('\n');
  const embed = buildAnnouncementEmbed({ issue: 'Spring Collection' }, 'Call for Contributions', body).toJSON();
  assert.equal(embed.description, '**Categories:** Fiction and poetry\n**Prompt:** Your chosen theme\n**Word limits:** Your limits\n\n## Guidelines\nRead [our guidelines](https://example.org/guidelines).');
  assert.deepEqual(embed.fields.map(field => field.name), ['Participation']);
  assert.doesNotMatch(embed.fields[0].value, /\n\n/);
  assert.match(embed.fields[0].value, /interest/);
  assert.match(embed.fields[0].value, /does not submit a manuscript or confirm acceptance/);
});

test('normal prose and fenced Markdown are preserved during duplicate-section cleanup', () => {
  const body = 'We discuss how to participate in our workshop.\n\n```text\n## How to Participate\nExample content\n```\n\n**Notes:** Keep these details.';
  assert.equal(buildAnnouncementEmbed({ issue: 'Collection' }, 'Open call', body).toJSON().description, body);
  for (const heading of ['**How to Participate**', 'How to Participate:', '**Participation:**']) {
    const embed = buildAnnouncementEmbed({ issue: 'Collection' }, 'Open call', `${heading}\nDuplicate instructions.\n**Word limits:** Custom limits`).toJSON();
    assert.equal(embed.description, '**Word limits:** Custom limits');
  }
});

test('dates have a compact section and submission instructions accept any method without requiring a link', () => {
  for (const submission of [
    'Use [our form](https://example.org/form). Read [the guidelines](https://example.org/guidelines).',
    'Send work to submissions@example.org using the community guidelines.',
    'Contact the editors in the submissions channel for instructions.',
  ]) {
    const embed = buildAnnouncementEmbed({ issue: 'Collection' }, 'Open call', 'Custom prompt and categories.', {
      dates: '  **Deadline:** Staff deadline\n\n**Release:** Staff release date  ', submission,
    }).toJSON();
    assert.deepEqual(embed.fields.map(field => field.name), ['Important Dates', 'How to Submit', 'Participation']);
    assert.equal(embed.fields[0].value, '**Deadline:** Staff deadline\n**Release:** Staff release date');
    assert.equal(embed.fields[1].value, submission);
  }
  const omitted = buildAnnouncementEmbed({ issue: 'Collection' }, 'Open call', 'Details', { dates: ' ', submission: '\n' }).toJSON();
  assert.deepEqual(omitted.fields.map(field => field.name), ['Participation']);
});

test('intro is omitted by default or when redundant while distinct custom messages are preserved', () => {
  assert.equal(typeof buildAnnouncementPayload, 'function');
  const issue = { issue: 'Spring Collection', generation: 'abc', enabled: true };
  const details = { title: 'Call for Contributions', description: 'Custom details.' };
  for (const message of [undefined, null, '', '   ', 'Spring Collection', '**Call for Contributions**', 'Custom details.']) {
    const payload = buildAnnouncementPayload(issue, { ...details, message });
    assert.equal(Object.hasOwn(payload, 'content'), false);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    assert.equal(payload.components[0].toJSON().components[0].custom_id, 'wren:contributor:abc');
  }
  const payload = buildAnnouncementPayload(issue, { ...details, message: '  A special note from the editors.  ' });
  assert.equal(payload.content, 'A special note from the editors.');
});
