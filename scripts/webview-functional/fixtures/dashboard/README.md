# Dashboard functional fixture

This isolated workspace contains no Agent configuration, project files, or credentials. The
Dashboard scenario installs one feature package whose historical `getSkills()` entries are command
wrappers and verifies by stable artifact id that they do not enter the installed-Skill projection.
The scenario does not capture Dashboard DOM or screenshots because the attached built-in Debug Host
may also have user-installed extensions; reports must not collect their private catalog projection.
