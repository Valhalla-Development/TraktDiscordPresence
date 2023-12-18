<div align="center">
  <br />
  <p>
    <img src="https://share.valhalladev.org/r/XPk8iq.png" width="550" alt="Trakt Discord Presence" />
  </p>
  <br />
  <p>
  <a href="https://discord.gg/Q3ZhdRJ">
    <img src="https://img.shields.io/discord/495602800802398212.svg?colorB=Blue&logo=discord&label=Support&style=for-the-badge" alt="Support">
  </a>
  <a href="https://github.com/RagnarLothbrok-Odin/TraktDiscordPresence">
    <img src="https://img.shields.io/github/languages/top/RagnarLothbrok-Odin/TraktDiscordPresence.svg?style=for-the-badge" alt="Language">
  </a>
  <a href="https://github.com/RagnarLothbrok-Odin/TraktDiscordPresence/issues">
    <img src="https://img.shields.io/github/issues/RagnarLothbrok-Odin/TraktDiscordPresence.svg?style=for-the-badge" alt="Issues">
  </a>
  <a href="https://github.com/RagnarLothbrok-Odin/TraktDiscordPresence/pulls">
    <img src="https://img.shields.io/github/issues-pr/RagnarLothbrok-Odin/TraktDiscordPresence.svg?style=for-the-badge" alt="Pull Requests">
  </a>
  <a href="https://app.codacy.com/gh/RagnarLothbrok-Odin/TraktDiscordPresence/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade">
    <img src="https://img.shields.io/codacy/grade/eb4d99a79b5c4151a7431b1cb1057e1b?style=for-the-badge" alt="Codacy Ranking">
  </a>
  </p>
</div>

# Trakt Discord Presence

Instantly stream your watching status on Discord courtesy [Trakt](https://trakt.tv/). Please note, due to certain
limitations on Discord, this script is required to run on the same device as your Discord client.

## Requirements

- [Node.js](https://nodejs.org)
- [Yarn](https://yarnpkg.com)
- [Trakt.tv](https://trakt.tv) & [Discord](https://discord.com) accounts

## Installation & Setup

1. [Download](https://github.com/RagnarLothbrok-Odin/TraktDiscordPresence/releases), extract, and move the latest
   release to your chosen location.

2. [Install Node.js](https://nodejs.org) (preferably the `LTS` version) and ensure `Node` is added to `PATH`.

3. [Install Yarn](https://classic.yarnpkg.com/en/docs/install) globally, navigate to the source directory using the `cd`
   command.
    ```Shell
    npm install --global yarn
    cd /path/to/your/extracted/source
    ```

4. Install packages using `yarn install`. A confirmation message appears upon successful installation.

## App Configuration

1. [Create a new Trakt application](https://trakt.tv/oauth/applications), name it `Discord` and set `Redirect uri`
   as `urn:ietf:wg:oauth:2.0:oob`.

2. [Create a new Discord application](https://discord.com/developers/applications), name it `Trakt` and
   add `trakt.png` (available in `images` folder) as the app icon and as the cover image in `Rich Presence` section.
   Upload the remaining images found in `images` folder.

## How to Use

1. Run the program using `yarn start`.

2. It prompts for [Trakt Client ID and Secret](https://trakt.tv/oauth/applications)
   and [Discord Client ID](https://discord.com/developers/applications) (Refer to `App Configuration` section if not
   already setup).

3. It prompts for your preferred UI mode, either 'Progress Bar' or 'Standard Log' Examples of both outputs can be seen
   at the bottom of this page.

4. You're then provided a `URL`. Paste this onto any browser, retrieve the code and enter it in your terminal.

5. Run `yarn start` to launch the program.

If set up correctly, your output should resemble this:

- **Progress Bar**
  </br><img src="https://share.valhalladev.org/u/progress_bar.png" alt="Progress Bar" style="width: 1000px;">
- **Standard Log**
  </br><img src="https://share.valhalladev.org/u/standard_log.png" alt="Standard Log" style="width: 700px;">

## License

<a href="https://choosealicense.com/licenses/mit/"><img src="https://raw.githubusercontent.com/johnturner4004/readme-generator/master/src/components/assets/images/mit.svg" height=40 /></a>
