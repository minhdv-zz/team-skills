Adds a Team Skills page to Paseo settings. It lists the shared Claude skills published at https://minhdv-zz.github.io/team-skills/ and installs a chosen skill with one click.

Installing downloads the team-skills repository from GitHub and copies the selected skill folder into the Claude skills folder on the machine that runs the Paseo daemon: either `.claude/skills` or `.claude-api/skills` in the home folder, chosen on the page. An existing folder with the same name is replaced. Restart Claude Code to load newly installed skills.

The plugin reads the skill list and downloads files from github.com and github.io. It writes only inside the chosen skills folder, and only for skill names that appear in the published list.

