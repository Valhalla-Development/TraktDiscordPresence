<div align="center">
  <img id="top" src="https://share.valhalladev.org/u/TraktDiscordPresence.png" width="100%" alt="TraktDiscordPresence Banner">

# 🎬 TraktDiscordPresence: Your Binge-Watching Broadcaster! 🎭

  <p>
    <a href="https://discord.gg/Q3ZhdRJ"><img src="https://img.shields.io/discord/495602800802398212.svg?colorB=5865F2&logo=discord&logoColor=white&style=for-the-badge" alt="Discord"></a>
    <a href="https://github.com/Valhalla-Development/TraktDiscordPresence/stargazers"><img src="https://img.shields.io/github/stars/Valhalla-Development/TraktDiscordPresence.svg?style=for-the-badge&color=yellow" alt="Stars"></a>
    <a href="https://github.com/Valhalla-Development/TraktDiscordPresence/network/members"><img src="https://img.shields.io/github/forks/Valhalla-Development/TraktDiscordPresence.svg?style=for-the-badge&color=orange" alt="Forks"></a>
    <a href="https://github.com/Valhalla-Development/TraktDiscordPresence/issues"><img src="https://img.shields.io/github/issues/Valhalla-Development/TraktDiscordPresence.svg?style=for-the-badge&color=red" alt="Issues"></a>
    <a href="https://github.com/Valhalla-Development/TraktDiscordPresence/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Valhalla-Development/TraktDiscordPresence.svg?style=for-the-badge&color=blue" alt="License"></a>
    <br>
    <a href="https://app.codacy.com/gh/Valhalla-Development/TraktDiscordPresence/dashboard"><img src="https://img.shields.io/codacy/grade/eac94fd0150b41fe924e66cd2d2a41b9?style=for-the-badge&color=brightgreen" alt="Codacy"></a>
    <a href="#"><img src="https://img.shields.io/badge/Powered%20by-Trakt-ED1C24?style=for-the-badge&logo=trakt&logoColor=white" alt="Powered by Trakt"></a>
    <a href="#"><img src="https://img.shields.io/badge/Made%20with-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="Made with TypeScript"></a>
  </p>

  <p><em>Because your friends deserve to know you're on your 17th consecutive hour of that obscure Danish crime drama!</em></p>
</div>

---
## 🌟 Welcome to the Couch Potato's Dream App!

TraktDiscordPresence is the missing link between your Trakt.tv account and Discord status. Now, your friends can marvel at your impressive TV show marathon skills or judge your questionable movie choices - all in real-time! Whether you're diving into a new series, revisiting a classic, or just leaving Netflix running in the background while you nap, TraktDiscordPresence has got you covered.

## 🎭 Features That'll Make You the Star of Discord

<table>
  <tr>
    <td width="50%">
      <h3>🔄 Real-Time Sync</h3>
      <p>Your Discord status updates faster than you can say "Just one more episode"!</p>
    </td>
    <td width="50%">
      <h3>🎨 Rich Presence Display</h3>
      <p>Show off what you're watching with style - movie posters included!</p>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <h3>📊 Smart Progress Tracking</h3>
      <p>Let everyone know you're 5 hours into your 12-hour binge session!</p>
    </td>
    <td width="50%">
      <h3>🛠️ Easy Setup & Configuration</h3>
      <p>Get up and running quicker than deciding what to watch next!</p>
    </td>
  </tr>
</table>

## 🚀 Requirements

- [Bun](https://bun.sh/)
- [Trakt.tv](https://trakt.tv/) account
- [Discord](https://discord.com/) account

## 🛠️ Installation & Setup

1. [Download](https://github.com/Valhalla-Development/TraktDiscordPresence/releases) the latest release.

2. Extract and move the files to your desired location.

3. Install Bun:
   - Mac/Linux:
     ```bash
     curl -fsSL https://bun.sh/install | bash
     ```
   - Windows:
     ```powershell
     powershell -c "irm bun.sh/install.ps1 | iex"
     ```

4. Navigate to your project folder:
    ```bash
    cd /path/to/your/extracted/source
    ```

5. Install dependencies:
    ```bash
    bun install
    ```

## ⚙️ App Configuration

1. [Create a new Trakt application](https://trakt.tv/oauth/applications)
    - Name it `Discord`
    - Set `Redirect uri` as `urn:ietf:wg:oauth:2.0:oob`

2. [Create a new Discord application](https://discord.com/developers/applications)
    - Name it `Trakt`
    - Add `trakt.png` from the `images` folder as the app icon and cover image in `Rich Presence` section
    - Upload the remaining images from the `images` folder

3. Rename `.env.example` to `.env` and input the information from steps 1 and 2

## 🎬 Usage

1. Start the application:
   ```bash
   bun start
   ```

2. The authentication process will run on first launch:
   - The application will provide a link in the terminal
   - Copy the code displayed in the terminal
   - Open the provided link in your browser
   - Paste the copied code into the website to authorize the application

3. After initial setup, run `bun start` again to launch the program.

Upon successful setup, your console output should resemble this:

- **Console Output**
  </br><img src="https://share.valhalladev.org/u/TraktDiscordPresence-Console.png" width="80%" alt="Example Output">
- **Discord Status**
  </br><img src="https://share.valhalladev.org/u/TraktDiscordPresence-Discord.png" width="30%" alt="Discord Example">

## 📊 Logging

The application provides real-time updates on your watching status directly in the console.

## 🤝 Contributing

We welcome contributions to TraktDiscordPresence. If you'd like to contribute, please follow these steps:

1. Fork the repository
2. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes and commit them with a clear, descriptive message:
   ```bash
   git commit -m 'Add feature: brief description of your changes'
   ```
4. Push your changes to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```
5. Open a Pull Request against the main repository's `main` branch

Please ensure your code adheres to the project's coding standards and include tests for new features or bug fixes where applicable. We appreciate detailed descriptions in your Pull Request to help with the review process.

## 📜 License

This project is licensed under the GPL-3.0 License - see the LICENSE file for details. (It's mostly "Share the love, and keep it open!")

## 🙏 Wall of Fame

- [Trakt.tv](https://trakt.tv/) for keeping track of our questionable viewing habits
- [Discord](https://discord.com/) for giving us a place to show off said habits
- All our contributors, supporters, and that one guy who starred the repo by accident

## 📬 Join the Watch Party

Got questions? Want to debate the best TV shows? Join our [Discord server](https://discord.gg/Q3ZhdRJ) - it's like a virtual living room, but with less fighting over the remote!

---

<div align="center">

💻 Crafted with ❤️ (and many snacks) by [Valhalla-Development](https://github.com/Valhalla-Development)

[🐛 Spotted an issue?](https://github.com/Valhalla-Development/TraktDiscordPresence/issues/new?assignees=&labels=bug&projects=&template=bug_report.yml&title=%5BBUG%5D+Short+Description) | [💡 Got an idea?](https://github.com/Valhalla-Development/TraktDiscordPresence/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.yml&title=%5BFeature%5D+Short+Description) | [🤔 Need a viewing guide?](https://discord.gg/Q3ZhdRJ)

<a href="#top">🔝 Back to Top (Time for a Snack Break)</a>
</div>
