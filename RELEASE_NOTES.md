# PromptMistress v0.2.0 — Release Notes

**Release Date:** 2026-09-17  
**Status:** Beta - Ready for testing

## What's New

### ✅ Core Features
- **Autonomous app** — Runs standalone on macOS with embedded Node + Python
- **Unified library** — Manage all prompts/chats from ChatGPT & Perplexity in one place
- **Full-text search** — Boolean operators, instant results
- **Tags & organization** — Favorite tags with custom colors, hide/archive actions
- **Import/Export** — JSON support, bookmarklet alternative
- **Drag & drop** — Organize collections by dragging

### ✅ Distribution & Deployment
- **Automated builds** — `./scripts/build.sh` generates `.app`, `.dmg`, `.zip`
- **CI/CD** — GitHub Actions workflow for build automation
- **Code signing** — Ad-hoc signing included, Developer ID ready
- **Notarization script** — `sign-and-notarize.sh` for Apple compliance

### ⚠️ Extension (Beta)
- **Browser extension** — Chrome/Edge/Firefox (developer mode)
- **Capture conversations** — Direct import from ChatGPT & Perplexity
- **Status:** In development, requires manual testing
- **Alternative:** Bookmarklet available for users who prefer not to use extension

### ✅ Testing & Quality
- **Non-regression suite** — `verify.mjs` covers app, server, build, extension
- **Unit tests** — Extension manifest validation
- **Real browser testing** — Pending for extension (v0.2.1)

## Installation

### Users
1. Download `PromptMistress-0.2.0-macOS.dmg` from releases
2. Drag `PromptMistress.app` to Applications
3. Launch and open http://127.0.0.1:18431/ in browser

### Developers
```bash
cd /path/to/PromptMistress-v2
npm start              # Dev server on http://127.0.0.1:18431/
npm run build         # Build macOS bundle
npm test              # Run non-regression tests
```

### Extension (Beta)
See `browser-extension/README.md` for dev mode loading on Chrome/Firefox.

## Known Issues & Limitations

1. **Extension requires dev mode** — Not yet in Chrome Web Store
2. **Gatekeeper warnings** — Ad-hoc signing causes warnings on first run (use bookmark to bypass)
3. **No native Apple notarization** — Requires Developer ID certificate (planned for v0.3.0)
4. **Python detection** — Auto-detects system Python 3 (fallback behavior added)

## What's Next (v0.2.1+)

- [ ] Extension validation on real ChatGPT/Perplexity
- [ ] Bug fixes from beta testing
- [ ] Improved error messages
- [ ] Perplexity API robustness

## What's Planned (v0.3.0+)

- [ ] Apple Developer ID certificate & notarization
- [ ] Auto-notarization in CI/CD
- [ ] Extension in Chrome Web Store
- [ ] WebSocket sync for real-time updates
- [ ] Perplexity full implementation (beta refinements)

## System Requirements

- **macOS** 13+
- **Node.js** 20+ (bundled in app)
- **Python** 3.9+ (bundled in app)
- **Browser** Chrome 120+, Firefox 121+, Edge 120+

## Security & Privacy

- **Local-only** — All data stays on your machine
- **No telemetry** — No tracking or data collection
- **API credentials** — Never stored or transmitted
- **Open source** — Code available for audit

## Credits

Built with Node.js + Python. Browser extension uses Chrome Manifest V3 API.

## Support

- **Bug reports** → GitHub Issues
- **Feature requests** → GitHub Discussions
- **Beta feedback** → Create an issue with [BETA] label

---

**Ready to test?** Install from releases and report your findings!
