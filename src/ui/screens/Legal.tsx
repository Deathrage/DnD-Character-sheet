import type { ReactNode } from 'react';
import { routeHash, type LegalPage } from '../route.js';

/**
 * The Privacy Policy and the Terms of Use, as in-app pages rather than static files: they are
 * precached with the rest of the app, so they open offline, and `#/privacy` and `#/terms` are the
 * URLs handed to Google's OAuth branding.
 *
 * Two documents, not one: GDPR wants the privacy information on its own rather than inside the
 * terms the player accepts, and Google's OAuth branding asks for each URL. Each topic lives in
 * one of them and the other links to it — what data goes where in the policy, the rules of use
 * and every promise about the service in the terms.
 *
 * The texts describe what the code does. Change one without the other and the page lies: a new
 * store of personal data, a new processor, analytics, or anything written to the device beyond
 * what "Storage on your device" lists, all need a line here and a new `UPDATED`.
 */
const UPDATED = '25 September 2026';
const CONTACT = 'hi@lukasprochazka.net';
const APP_ORIGIN = 'dnd-character-sheet-64a24.web.app';

export function LegalScreen({ page, onBack }: { page: LegalPage; onBack(): void }) {
  const { title, body } = PAGES[page];
  return (
    <div className="app legal">
      <div className="lhead">
        <div className="vtop">
          <button type="button" className="back" onClick={onBack} aria-label="Back to characters">
            {'‹'}
          </button>
          <h1>{title}</h1>
        </div>
        <div className="sub">Last updated {UPDATED}</div>
      </div>
      <article className="lbody">{body}</article>
    </div>
  );
}

/**
 * Shown beside every sign-in button: signing in is when the cloud data is collected, so it is
 * where the player is told (GDPR Art. 13). Accepting the terms by using the feature is enough for
 * a free app. A checkbox would need an acceptance record that survives the sign-in redirect, and a
 * launch-time prompt would ask every player to accept terms for a local mode that sends nothing.
 */
export function CloudTerms() {
  return (
    <p className="hint legalnote">
      By using cloud backup you accept the{' '}
      <a href={routeHash({ name: 'legal', page: 'terms' })}>Terms of Use</a>. The{' '}
      <a href={routeHash({ name: 'legal', page: 'privacy' })}>Privacy Policy</a> explains what it
      stores.
    </p>
  );
}

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;
const privacyLink = <a href={routeHash({ name: 'legal', page: 'privacy' })}>Privacy Policy</a>;
const termsLink = <a href={routeHash({ name: 'legal', page: 'terms' })}>Terms of Use</a>;

const PAGES: Record<LegalPage, { title: string; body: ReactNode }> = {
  privacy: {
    title: 'Privacy Policy',
    body: (
      <>
        <p>
          This policy covers the character sheet app at {APP_ORIGIN}. You can use it without an
          account, and then nothing you enter ever leaves your device. This policy explains that,
          and what changes if you turn on cloud backup.
        </p>

        <h2>Who is responsible</h2>
        <p>
          The app is run by Lukáš Procházka, a private individual in the Czech Republic, who is the
          controller of the personal data described here (&ldquo;I&rdquo; below). Contact: {mail}.
        </p>

        <h2>Using the app without an account</h2>
        <p>
          Your characters, portraits, journals and notes are stored in your browser, on your device.
          They are never sent to me or to anyone else, and I cannot see, recover or delete them.
          Clearing this site&rsquo;s data in your browser, or uninstalling the app, deletes them. A
          file you export goes wherever you save it.
        </p>

        <h2>Visiting the site</h2>
        <p>
          The app is hosted on Firebase Hosting, a Google service. As with any website, delivering
          it means Google&rsquo;s servers process your IP address and browser details. Google keeps
          these request logs for a limited period to operate and secure the service. The legal basis
          is my legitimate interest in delivering the app and keeping it secure (Art.&nbsp;6(1)(f)
          GDPR).
        </p>

        <h2>Cloud backup</h2>
        <p>Cloud backup is optional and starts only when you sign in with Google.</p>
        <ul>
          <li>
            <strong>Your account.</strong> Google shares your name, email address and profile
            picture link with the app. Firebase Authentication, a Google service, stores them with
            an account ID and the times you created the account and last signed in. The app shows
            your name and email address; it does not use your picture. During sign-in Google also
            processes your IP address and browser details to prevent abuse.
          </li>
          <li>
            <strong>Your backups.</strong> Each upload stores a copy of the character sheet and its
            portrait, with the time of the upload. A sheet contains whatever you typed into it,
            journal and notes included. Please do not put sensitive information about yourself or
            others into a sheet you upload.
          </li>
        </ul>
        <p>
          The legal basis is providing the backup service you asked for (Art.&nbsp;6(1)(b) GDPR).
          Backups are stored in Cloud Firestore in the European Union (Belgium and the Netherlands).
          Account data in Firebase Authentication is stored on Google&rsquo;s infrastructure, which
          includes the United States.
        </p>

        <h2>Who else receives your data</h2>
        <p>
          Only Google (Google Ireland Limited and Google LLC), which processes it on my behalf under
          the Firebase Data Processing and Security Terms. Transfers to the United States rely on
          Google LLC&rsquo;s certification under the EU-U.S. Data Privacy Framework and on the EU
          Standard Contractual Clauses in Google&rsquo;s terms. I do not sell your data, show ads,
          use analytics, or make automated decisions or profiles about you.
        </p>

        <h2>Who can read your backups</h2>
        <p>
          Other users cannot: access rules limit every account to its own backups. Backups are not
          end-to-end encrypted, though, so as the operator I have technical access to them through
          the Firebase console. I do not look at them, except when you ask me for help or when the
          law requires it.
        </p>

        <h2>How long data is kept</h2>
        <ul>
          <li>
            Backups: until you delete them on the Cloud screen, or ask me to delete your account.
          </li>
          <li>Your account: until you ask me to delete it. Signing out deletes nothing.</li>
          <li>Hosting and sign-in logs: for the limited period Google keeps them.</li>
          <li>
            Everything in the cloud is deleted if cloud backup is discontinued, after the notice the{' '}
            {termsLink} promise.
          </li>
        </ul>

        <h2>Storage on your device</h2>
        <p>
          The app stores your characters and portraits in your browser&rsquo;s IndexedDB, keeps a
          few settings in its local and session storage, and caches itself so it works offline. When
          you are signed in, Firebase keeps your sign-in session in browser storage. All of this is
          strictly necessary for the app you are using, so it needs no consent. The app uses no
          cookies or trackers for analytics or advertising.
        </p>

        <h2>Your rights</h2>
        <p>
          You have the right to access your data, to have it corrected or erased, to restrict its
          processing, to receive it in a portable format, and to object to processing based on
          legitimate interest.
        </p>
        <ul>
          <li>
            <strong>Delete backups</strong> yourself, at any time, on the Cloud screen.
          </li>
          <li>
            <strong>Delete your account</strong> and everything in it, or exercise any other right,
            by emailing {mail} from the address of your Google account, so I can tell it is you. I
            will answer within one month.
          </li>
          <li>
            <strong>Take your data with you</strong> at any time by exporting a character to a JSON
            file.
          </li>
        </ul>
        <p>
          You can also complain to a data protection authority: in the Czech Republic, the Office
          for Personal Data Protection (ÚOOÚ), Pplk. Sochora 27, 170 00 Praha 7,{' '}
          <a href="https://www.uoou.gov.cz" target="_blank" rel="noreferrer">
            www.uoou.gov.cz
          </a>
          , or the authority in the EU country where you live or work.
        </p>

        <h2>Changes</h2>
        <p>
          The date at the top shows when this policy last changed. Significant changes will be
          announced in the app.
        </p>
      </>
    ),
  },
  terms: {
    title: 'Terms of Use',
    body: (
      <>
        <p>
          These terms apply to the character sheet app at {APP_ORIGIN} (&ldquo;the app&rdquo;). It
          is provided free of charge by Lukáš Procházka (&ldquo;I&rdquo;), a private individual, not
          a business. The app&rsquo;s source code is licensed separately, under the MIT License.
        </p>

        <h2>Your characters are stored on your device</h2>
        <p>
          The app keeps your characters in your browser. A browser can delete that storage, for
          example when the device runs low on space, when you clear site data, or on some phones
          after a period without use, and I cannot recover anything it deletes.{' '}
          <strong>Export your characters regularly</strong>: keeping copies is your responsibility.
        </p>

        <h2>Cloud backup</h2>
        <p>
          Cloud backup is optional and needs a Google account. Cloud space is limited. It is
          provided on a best-effort basis, with no guarantee that it will always be available or
          that a backup can always be restored. I may change or discontinue it; if I discontinue it,
          I will announce that in the app at least 30 days in advance, so you can restore your
          characters first.
        </p>

        <h2>Your content</h2>
        <p>
          Your characters are yours. By uploading one, you allow me only what is needed to store it
          and give it back to you. Upload only content you have the right to use, such as portraits,
          and nothing unlawful. I may remove content that is unlawful.
        </p>

        <h2>Fair use</h2>
        <p>
          Do not try to access other people&rsquo;s data, interfere with the app or its servers, use
          the cloud backup for anything other than character sheets, or overload it with automated
          requests.
        </p>

        <h2>Accounts</h2>
        <p>
          You need to be at least 15 to use cloud backup, or have permission from a parent or
          guardian. I may suspend or delete a cloud account that breaks these terms. Unless the
          breach is serious (unlawful content, or an attempt to reach other people&rsquo;s data or
          disrupt the app), I will email you first, so you can restore your characters. Characters
          stored on your device are never affected. You can stop at any time: delete your backups on
          the Cloud screen and ask me to delete your account, as the {privacyLink} describes.
        </p>

        <h2>No warranty</h2>
        <p>
          The app is provided &ldquo;as is&rdquo;, without warranties of any kind. It does no rules
          calculations: every number on a sheet is the one you entered, and checking your character
          against the rules you play by is up to you and your table.
        </p>

        <h2>Liability</h2>
        <p>
          As far as the law allows, I am not liable for any loss or damage from using the app,
          including lost characters or backups. This does not limit liability that the law does not
          allow to be limited, such as for harm caused intentionally or through gross negligence.
        </p>

        <h2>Trademarks</h2>
        <p>
          This is an unofficial, fan-made tool. It is not affiliated with, endorsed or sponsored by
          Wizards of the Coast. Dungeons &amp; Dragons and D&amp;D are trademarks of Wizards of the
          Coast LLC.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          I may change these terms at any time. The date at the top shows the current version, and
          significant changes will be announced in the app. If you keep using cloud backup after a
          change, the new terms apply to you; if you do not agree with them, stop using it and
          delete your backups.
        </p>

        <h2>Law and disputes</h2>
        <p>
          These terms are governed by Czech law, and disputes are decided by the courts of the Czech
          Republic, unless mandatory law provides otherwise.
        </p>

        <h2>Contact</h2>
        <p>{mail}</p>
      </>
    ),
  },
};
