# Wren Discord Bot

Wren is a locally hosted Discord bot built for Wet Paper Magazine. It gives the community a way to share quotes, helps staff track individual pieces through editing, and manages participation in magazine issues.

This repository contains the existing implementation, published as a portfolio project by [mr-vitamin](https://github.com/mr-vitamin). Wren uses Discord slash commands and interactive components, with local JSON files for persistent state.

## Implemented features

### Community quotes

- `/quote` accepts quote text and a speaker, then posts a formatted embed in the configured quotes channel.
- Attribution uses the speaker's server display name when available.
- Markdown is escaped and automatic mentions are disabled in the published quote.
- Wrong-channel directions and posting confirmations are private.

### Editorial submission tracker

Staff use these commands in the private `bot-coms` channel:

| Command | Purpose |
| --- | --- |
| `/sub add` | Add a piece with its title, author, and optional Discord post link. |
| `/sub mark` | Set a piece to `submitted`, `editing`, or `edited`. |
| `/sub assign` | Assign an editor or clear the assignment. |
| `/sub list` | List unfinished, edited, or all tracked pieces. |
| `/sub show` | View one piece by its `WP-###` identifier. |
| `/sub summary` | Show status counts and unfinished pieces without an editor. |

The tracker supports multiple pieces per author, rejects duplicate post links, and saves records across restarts. Successful tracker replies are visible to people with access to the staff channel. Access to `/sub` relies on the configured guild and private channel permissions; the handler does not require a separate staff role.

### Issue participation

- `/contributor announce` posts a staff-written announcement with a **Participate / Withdraw** dropdown.
- Members can add or remove the existing `Contributor` role through the dropdown and receive private confirmations.
- `/contributor close` closes participation while keeping existing roles.
- `/contributor reset` requires a confirmation button, removes the role from current holders, and reports successful and failed removals.
- Saved issue state rejects closed or outdated dropdowns. A shared lock coordinates participation changes and staff operations.

Contributor staff commands require **Manage Roles** and the configured staff channel. Participation expresses interest in an issue; it does not submit a manuscript or indicate publication acceptance. The original project describes this feature as a local implementation candidate; this repository does not establish that it has been tested in a live server.

## Technologies

- **JavaScript / CommonJS** on **Node.js**.
- **discord.js 14** for Discord Gateway events, REST command registration, embeds, buttons, dropdowns, and permissions.
- **Node.js built-in test runner** and `node:assert` for automated tests.
- **Local JSON storage** with temporary-file writes followed by rename.
- **Windows PowerShell and Windows DPAPI** for token setup and decryption.
- **Windows Task Scheduler and VBScript** for optional background startup and process supervision.

There is no external database or hosted backend. The current application entry point requires Windows because it decrypts its token through Windows PowerShell and DPAPI.

## Project structure

```text
assets/                         Wren avatar and editable SVG artwork
policies/                       Existing privacy policy and terms of use
src/
  index.js                      Client, slash commands, quotes, and tracker routing
  submissions.js                Editorial records and persistence
  contributor.js                Issue state, role operations, and coordination
  contributor-discord.js        Participation commands and Discord components
test/                           Automated tracker and participation tests
setup-token.ps1                 Hidden token prompt and DPAPI encryption
run-foxxie-quotes.ps1            Background runner, logging, and restart loop
start-foxxie-quotes-hidden.vbs   Windowless launcher
install-startup-task.ps1        Optional Windows sign-in task installer
remove-startup-task.ps1         Startup task removal
package.json
package-lock.json
```

The npm package and Windows scripts retain their original Foxie/Foxxie names. The scheduled task is named `Foxie Quotes Bot`.

## Local setup

### Requirements

- Windows with Windows PowerShell, Windows Script Host, and Node.js available on `PATH`.
- Node.js **18.17.0 or newer**, as required by the locked dependencies. Publication checks used Node.js 24.
- A Discord application and bot token, plus a test server you administer.

### Install and check

```powershell
git clone https://github.com/mr-vitamin/wren-discord-bot.git
cd wren-discord-bot
npm ci
npm run check
```

`npm run check` checks the entry point's syntax and runs the existing tests. These tests use local files and mocked Discord interactions; they do not log the bot into Discord.

### Configure Discord

The bot is configured for a single server. Before running your own copy:

1. Replace `GUILD_ID`, `COMMAND_CHANNEL_ID`, `QUOTES_CHANNEL_ID`, and `STAFF_COMMAND_CHANNEL_ID` in `src/index.js` with your own server and channel IDs. They identify Discord resources and are not authentication credentials.
2. Enable **Server Members Intent** in the Discord Developer Portal. The code requests both `Guilds` and `GuildMembers`; the complete Contributor reset needs member enumeration.
3. Authorize the application with the `bot` and `applications.commands` scopes. Grant the bot the channel permissions it needs to view channels, send messages, embed links, and read message history, plus **Manage Roles** for participation.
4. Create one role named `Contributor` and place Wren's bot role above it. Restrict access to the configured staff channel through Discord permissions.

On connection, Wren replaces this application's guild command list with `/quote`, `/sub`, and `/contributor`. Use a separate application for testing if an existing bot is already running.

### Store the token and start

```powershell
.\setup-token.ps1
npm start
```

Enter the token only in the setup script's hidden prompt. It writes `token.dat`, encrypts it with DPAPI for the current Windows user, and restricts access to that file. Run the bot under the Windows account that performed setup. When installing on another machine or account, run token setup again.

Wren does not currently load `.env` files or environment-based token settings. Do not put a token in the source code, README, or Git configuration.

### Optional automatic startup

```powershell
.\install-startup-task.ps1
Start-ScheduledTask -TaskName 'Foxie Quotes Bot'
```

The installer registers a sign-in task but does not start it. Its launcher runs the bot without a console window, writes output to `logs/`, and supervises the child process. To remove automatic startup, use `remove-startup-task.ps1`.

The task name is shared with the original installation. Installing from another folder updates that task's location. Coordinate a controlled stop and start when moving an active installation to avoid running duplicate bot sessions.

## Data and credentials

- `token.dat` holds the encrypted bot credential and stays local.
- `data/submissions.json` holds editorial records, including Discord identifiers and timestamps.
- `data/contributor-issue.json` holds the active issue's name, message/channel identifiers, enabled state, and dropdown generation.
- `logs/` holds operational output and may include error details.

These paths are excluded from Git along with `.env` files, credential files, dependencies, caches, and local work files. A fresh clone starts without live records; the application creates its data files when needed. Keep private backups before moving an existing installation. Submission records cannot be reconstructed from Discord posts.

Local JSON records are not encrypted at rest. The implementation has no automatic record retention or deletion workflow. The existing [privacy policy](policies/privacy.md) and [terms of use](policies/terms.md) describe the service; another operator should review them before deploying a copy.

## Verification scope

The automated suite covers editorial tracking and persistence, participation state, stale component rejection, role changes, reset confirmation, failure handling, and operation coordination. Passing these checks does not verify live Discord permissions, account configuration, or Windows startup after a reboot. Test those in a controlled server before deployment.
