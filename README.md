<a href="https://discord.gg/Q3ZhdRJ"><img src="https://img.shields.io/discord/495602800802398212?label=Discord&style=for-the-badge"/></a>
<a href="https://choosealicense.com/licenses/mit"><img src="https://img.shields.io/github/license/RagnarLothbrok-Odin/trakt-discord-presence.svg?style=for-the-badge"/></a>
![Repo Size](https://img.shields.io/github/languages/code-size/RagnarLothbrok-Odin/trakt-discord-presence.svg?style=for-the-badge)
![TOP_LANGUAGE](https://img.shields.io/github/languages/top/RagnarLothbrok-Odin/trakt-discord-presence.svg?style=for-the-badge)
![FORKS](https://img.shields.io/github/forks/RagnarLothbrok-Odin/trakt-discord-presence.svg?style=for-the-badge&social)
![Stars](https://img.shields.io/github/stars/RagnarLothbrok-Odin/trakt-discord-presence.svg?style=for-the-badge)
    
# Trakt Discord Presence
Set your Discord presence according to what you are watching on [Trakt](https://trakt.tv/)


## NOTE:
This project technically does function in its current form, but it is **NOT** finished.
Feel free to open any issues/PR request on how I can improve this, following is a to-do list

- [ ] Move main code into a function
- [ ] Detect when lose connection to Discord


## Prerequisites
* [Node.js](https://nodejs.org)
* [Yarn](https://yarnpkg.com)
* [Trakt.tv Account](https://trakt.tv)
* [Discord Account](https://discord.com)


## Installation
1. [Download the source code](https://github.com/RagnarLothbrok-Odin/trakt-discord-presence/archive/refs/heads/main.zip)
    * Extract the folder that was downloaded to your desired location using your preferred software, [WinRar for example](https://www.win-rar.com)
2. [Download Node.js](https://nodejs.org) 
    * `LTS` preferred, Current should work but `LTS` is recommended
    * Ensure that `Node` is installed to `PATH`, it should be an option while installing
3. [Install Yarn](https://yarnpkg.com)
    * Open CMD/terminal/console on your device
    * Point your CMD/terminal/console the folder that you extracted the source to, by using the `cd` command, an example follows:

          cd /Users/ragnarlothbrok/Downloads/trakt-discord-presence
4. Install the necessary packages with the following command:

       yarn install
    * A message will indicate when this step is completed


## Setup
1. [Create your Trakt application](https://trakt.tv/oauth/applications)
    * After clicking the above link, click `NEW APPLICATION`
    * Set the `Name` as: `Discord`
    * Set the `Redirect uri` as `urn:ietf:wg:oauth:2.0:oob`

2. [Create your Discord application](https://discord.com/developers/applications)
    * After clicking the above link, click `New Application`
    * Set the `NAME` as: `Trakt`
    * Set the app icon by clicking the box under where it says `APP ICON` _(Set this image to the file named_ `trakt.png` _(you can find this file in the folder named_ `images` _in the extracted source)_
    * Click `Rich Presence` on the left hand pane
    * Set the cover image by clicking the box under where it say `Select Image` _(Set this image to the file named_ `trakt.png` _(you can find this file in the folder named_ `images` _in the extracted source)_
    * Click `Add Image(s)` and upload the `3` images you can find in the folder named `images` in the extracted source


## Usage
1. Run the program by running the following command:

       node .
2. You will be asked for your [Trakt Client ID](https://trakt.tv/oauth/applications), if you did not create an application, ensure you read the [Setup section of this page](https://github.com/RagnarLothbrok-Odin/trakt-discord-presence/blob/main/README.md#setup)
3. You will be asked for your [Trakt Client Secret](https://trakt.tv/oauth/applications)
4. You will be provided a `URL`, you must paste this link into a browser of your choosing
    * Once you visit this `URL`, a code will be provided, you must paste this code into your CMD/terminal/console
5. Finally, you must now run the following code, replacing the string of numbers, with your [Discord Client ID](https://discord.com/developers/applications), if you did not create an application, ensure you read the [Setup section of this page](https://github.com/RagnarLothbrok-Odin/trakt-discord-presence/blob/main/README.md#setup)

          node . 123456789098765432


## Functionality
If you follow all the steps correctly, you should see an output similar to the following
<img src="https://raw.githubusercontent.com/RagnarLothbrok-Odin/trakt-discord-presence/main/example.png">


## License
<a href="https://choosealicense.com/licenses/mit/"><img src="https://raw.githubusercontent.com/johnturner4004/readme-generator/master/src/components/assets/images/mit.svg" height=40 /></a>