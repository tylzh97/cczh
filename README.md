# cczh

## Install

On Claude Code 2.1.275 or later, in a session:

```
/plugin install cczh --marketplace tylzh97/cczh
```

Or from the shell:

```bash
claude plugin marketplace add tylzh97/cczh
```

Update to the latest version:

```bash
claude plugin marketplace update cczh
claude plugin update cczh@cczh
```

## DeepSeek API key

Either of these, the first wins:

1. Plugin option: `/plugin configure cczh@cczh`, or in `~/.claude/settings.json`:

   ```json
   "pluginConfigs": { "cczh@cczh": { "options": { "deepseek_api_key": "sk-..." } } }
   ```

2. Environment variable, e.g. in `~/.claude/settings.json`:

   ```json
   "env": { "DEEPSEEK_API_KEY": "sk-..." }
   ```

   Note that this also reaches every Bash command and MCP server Claude starts.

Restart Claude Code after changing either. The key is stored in plain text.

## Usage

- `/cczh on`: turn translation on; pings DeepSeek and reports whether it's usable
- `/cczh off`: turn translation off (both directions)
