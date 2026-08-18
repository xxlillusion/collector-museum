// Step 1: get a Collectr session onto this machine, WITHOUT this script ever
// seeing the password.
//
// The whole design of the credential story is here: we open a real, visible
// browser window and get out of the way. The user types into Collectr's own
// login form, in a normal browser, so 2FA, SSO and any human-verification
// challenge all work exactly as they normally do. This script takes no
// --user/--pass/--email flags and never calls fill() or type() on any field —
// there is no code path in this tool that touches a password.
//
// What we keep afterwards is the session (cookies + localStorage), not the
// credentials. That file is still sensitive: it is a bearer token for the
// account, which is why it is 0600, gitignored, and loudly labelled.

import {
  launchBrowser, waitForEnter, saveStorageState, isSignedIn,
  COLLECTR_APP, run, parseArgs, CliError,
} from './session.mjs';

const HELP = `
collectr login — save a Collectr session for the export script

  node tools/collectr-export/login.mjs
  npm run collectr:login

Opens a real browser window at ${COLLECTR_APP}. Sign in YOURSELF in that
window (2FA and captchas included — it is a normal browser), then come back
here and press Enter.

This script never asks for, stores or types your password. It saves only the
resulting session cookies to tools/collectr-export/.auth/state.json.

Options:
  --browser <name>  chrome (default) | msedge | chromium
  --help            Show this message
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP.trim());
    return;
  }

  console.log('\nOpening a browser window at Collectr…');
  const browser = await launchBrowser({ headed: true, browser: args.browser });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(COLLECTR_APP, { waitUntil: 'domcontentloaded' }).catch(() => {
      // A slow first paint is not a failure — the user can still sign in.
    });

    console.log(
      [
        '',
        '  1. Sign in to Collectr in the window that just opened.',
        '  2. Navigate to your collection/portfolio so the app finishes loading.',
        '  3. Come back here.',
        '',
        'Nothing you type in that window is visible to this script.',
        '',
      ].join('\n'),
    );

    // Verify before saving, and let the user try again. Saving an unverified
    // session is worse than failing here: it produces a plausible-looking
    // state.json that makes every later step report "session expired".
    let verified = false;
    for (let attempt = 1; attempt <= 3 && !verified; attempt++) {
      await waitForEnter('Press Enter once you are signed in and your collection is showing… ');

      process.stdout.write('Checking that the session really works… ');
      const check = await isSignedIn(context);
      if (check.ok) {
        console.log('signed in.');
        verified = true;
        break;
      }

      console.log('not signed in yet.');
      console.log(
        [
          '',
          `  That check landed on: ${check.url}`,
          '',
          '  If you signed in with Google, the exchange can still be finishing.',
          '  Leave the window open, make sure your CARDS are actually on screen,',
          '  then try again.',
          attempt < 3 ? '' : '',
        ].join('\n'),
      );

      if (attempt === 3) {
        throw new CliError(
          [
            'Could not confirm a signed-in Collectr session, so nothing was saved.',
            '',
            'Things worth checking:',
            '  - Are your cards visible in the browser window right now?',
            '  - Collectr sits behind AWS WAF; if it showed a human-verification',
            '    challenge, complete it in that window before pressing Enter.',
            '  - Try a different browser:  npm run collectr:login -- --browser msedge',
          ].join('\n'),
        );
      }
    }

    const path = await saveStorageState(context);

    console.log(
      [
        '',
        `Session saved: ${path}`,
        '',
        '  ! TREAT THIS FILE LIKE A PASSWORD.',
        '    Anyone who copies it is signed into your Collectr account.',
        '    It is gitignored. Delete it when you are done exporting.',
        '',
        'Next:  npm run collectr:discover',
        '',
      ].join('\n'),
    );
  } finally {
    await browser.close().catch(() => {});
  }
}

run(main);
