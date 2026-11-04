# 🏥 Barangay Alawihao - NutriGrid: A BNS MMADS System (Vite Version)

**⚡ This version uses Vite - Same as your KaBudget project!**

## 🚀 Quick Start (Like KaBudget)

```bash
npm install
npm run dev
```

That's it! Opens at `http://localhost:3000`

---

## 📋 Features

✅ Same features as the other version
✅ Uses Vite (like KaBudget) - **Much Faster!**
✅ Same commands: `npm run dev` and `npm run build`
✅ All 6 tables included
✅ Professional UI with Tailwind CSS

---

## 🆚 Comparison

### This Project (Vite)
```bash
npm install
npm run dev      # Start development
npm run build    # Build for production
npm run preview  # Preview production build
```
**Speed:** ⚡⚡⚡ Very Fast!

### Other Version (Create React App)
```bash
npm install
npm start        # Start development
npm run build    # Build for production
```
**Speed:** ⚡⚡ Fast

---

## 💡 Why Vite?

1. **Faster startup** - Starts in 1-2 seconds vs 10-20 seconds
2. **Faster hot reload** - Changes appear instantly
3. **Modern** - Same as KaBudget and modern projects
4. **Smaller builds** - Production files are smaller
5. **Better developer experience**

---

## 📁 Project Structure

```
barangay-health-monitoring/
├── index.html              # HTML template (in root, not public/)
├── src/
│   ├── main.jsx           # Entry point (not index.js)
│   ├── App.jsx            # Main component
│   └── index.css          # Global styles
├── package.json
├── vite.config.js         # Vite configuration
├── tailwind.config.js
└── postcss.config.js
```

---

## 🎯 Usage

### Development
```bash
npm run dev
```
- Opens browser automatically
- Hot reload enabled
- Fast refresh on file changes

### Build for Production
```bash
npm run build
```
- Creates optimized build in `dist/` folder
- Ready to deploy

### Preview Production Build
```bash
npm run preview
```
- Test the production build locally

---

## 🗄️ Database Integration

Same as the other version:
- **PocketBase** - See POCKETBASE_SETUP.md
- **Supabase** - See SUPABASE_SETUP.md

---

## 🎨 Customization

Everything is the same - just edit `src/App.jsx`

---

## 🔧 Key Differences from Create React App Version

| Feature | Vite (This) | Create React App |
|---------|-------------|------------------|
| Start command | `npm run dev` | `npm start` |
| Entry file | `src/main.jsx` | `src/index.js` |
| HTML location | Root folder | `public/` folder |
| Build output | `dist/` | `build/` |
| Speed | ⚡⚡⚡ | ⚡⚡ |
| Bundle size | Smaller | Larger |

---

## ✅ Installation Steps

1. **Extract the ZIP file**
2. **Install Node.js** (if not already)
3. **Open folder in VS Code**
4. **Open Terminal** (Ctrl + `)
5. **Run:**
   ```bash
   npm install
   npm run dev
   ```
6. **Done!** Browser opens automatically

---

## 🆘 Troubleshooting

### Same as Create React App version, but:
- Use `npm run dev` instead of `npm start`
- Build folder is `dist/` instead of `build/`
- HTML is in root, not `public/`

---

## 🎉 Benefits of This Version

✅ **Familiar** - Same commands as KaBudget
✅ **Fast** - Vite is lightning fast
✅ **Modern** - Industry standard
✅ **Simple** - Same workflow you know

---

**Use this version if you want the same experience as KaBudget!**
# Report email setup

The monthly report email uses a server-side Nodemailer/Gmail SMTP endpoint. For local
development, put `GMAIL_USER` and a newly generated `GMAIL_APP_PASS` in `.env.local`;
the Vite development server exposes `/api/reports/email`. The SMTP password is never
sent to the browser. Do not commit `.env.local`.

The endpoint verifies the Supabase access token and requires an approved `admin`
profile. The authenticated admin's name is used as the sender display name and their
profile email is set as Reply-To; Gmail's authenticated mailbox remains the sender
address. The generated signed PDF is attached.

For production, run `npm run email-api` as a separate Node service with
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `GMAIL_USER`, and `GMAIL_APP_PASS`
configured as server secrets. Set `REPORT_EMAIL_ALLOWED_ORIGINS` to the exact
frontend origin(s), and set `VITE_REPORT_EMAIL_API_URL` at frontend build time to
`https://<api-host>/api/reports/email`. Static hosting alone cannot run the SMTP API.
