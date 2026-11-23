---
title: Sign in to more than one instance with profiles
description: Keep a sign-in for each instance on one machine, switch between them with --profile, and sign out of one.
subjects: [cli, sign-in]
---

## Sign in to more than one instance with profiles

By the end the same machine is signed in to two instances, and each command says which one it talks to.

## Before you start

- An API key for each instance, made under **Account** in that instance's console: **API keys**, then **Create API key**. The key acts as you, with your permissions in that instance.
- The key begins `vxk_`.

## Sign in, with and without a profile

:::steps
1. Sign in to the instance you use most. This is the default sign-in:

   ```bash
   volvel login --url https://volvel.example.com --token vxk_...
   ```

   ```text
   Signed in to https://volvel.example.com as maya.brooks@fernhill.example.
   ```

   The command asks the instance who the key is before it saves anything. The address and key go to `~/.config/volvel/config.json`, or to `config.json` under `$XDG_CONFIG_HOME/volvel/` when that variable is set. The file is readable by you only, and the folder too. A plain `http://` address to a host other than `localhost`, `127.0.0.1` or `[::1]` is accepted with a warning on standard error that the key crosses the network unencrypted.
2. Sign in to another instance under a name. A profile name is letters, digits, `-` and `_`, up to 40, and starts with a letter or digit:

   ```bash
   volvel login --profile staging --url https://staging.volvel.example.com --token vxk_...
   ```

   The sign-in is saved beside the first, in `profile-staging.json`. The `--profile <name>` flag may stand anywhere on the line. The environment variable `VOLVEL_PROFILE` does the same for every command of a shell.
3. List what is saved. The default is shown as `(none)`:

   ```bash
   volvel profiles
   ```

   ```text
   (none)       https://volvel.example.com
   staging      https://staging.volvel.example.com
   ```
4. Use a profile for one command, or for a shell:

   ```bash
   volvel whoami --profile staging
   export VOLVEL_PROFILE=staging
   ```
5. Sign out of one. This removes the saved file of that profile, and nothing else:

   ```bash
   volvel logout --profile staging
   ```

   ```text
   Signed out: the saved key is removed from /home/you/.config/volvel/profile-staging.json.
   ```

   The key is not revoked: it still works from wherever else it is kept. Revoke it under **Account**, in **API keys**, with **Revoke**.
:::

## Set the instance and key in the environment

`VOLVEL_URL` and `VOLVEL_TOKEN` override what is saved, one field each. This is how a CI job signs in, with nothing saved: see [Run the command line in CI](run-the-cli-in-ci).

A saved key is sent only to the address it was saved for, with trailing slashes ignored. If you set `VOLVEL_URL` to another address and not `VOLVEL_TOKEN`, the command stops:

```text
The saved API key is for http://localhost:8091, not http://127.0.0.1:8091. Set VOLVEL_TOKEN to a key for http://127.0.0.1:8091, or run: volvel login --url http://127.0.0.1:8091 --token <api key>
```

## The result

Each command uses one sign-in: the profile named by `--profile` or `VOLVEL_PROFILE`, else the default, with `VOLVEL_URL` and `VOLVEL_TOKEN` over it. `volvel whoami` says who you are and where; `--json` gives the same as a document.

## If it does not work

- **`Not signed in. Run: volvel login --url <url> --token <api key>`.** Nothing is saved for this profile and the environment gives no address and key.
- **`The API key was not accepted. It may be revoked or expired. Create a new one and run login again.`** The instance does not know the key. Make another under **Account**.
- **`login needs both --url and --token.`** One was left out.
- **`--url must start with http:// or https://`.** The address has no scheme.
- **`<url> did not answer like a platform instance. Check the URL.`** The address answered, but not as a Volvel instance: a web page or a proxy. Give the address of the instance itself.
- **`A profile name is letters, digits, "-" and "_", up to 40, not "..."`.** The name has another character.
- **`--profile needs a name.`** The flag was last on the line, or was followed by another flag.
