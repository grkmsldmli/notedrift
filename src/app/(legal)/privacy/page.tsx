import type { Metadata } from "next";
import {
  LEGAL_CONTACT_EMAIL,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | NoteDrift",
  description:
    "How NoteDrift handles your data: local-first canvases stay in your browser, cloud save is explicit, and file and audio tools run on your device.",
  alternates: { canonical: "/privacy" },
};

const email = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-nd-accent hover:underline">{LEGAL_CONTACT_EMAIL}</a>;

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        NoteDrift is instant digital paper. It is built to be private by default:
        you can open it and work without an account, and your canvases stay on
        your device unless you explicitly choose to save them to the cloud. This
        policy explains what data NoteDrift handles, and when.
      </p>

      <LegalSection heading="Working locally (no account)">
        <p>
          When you open NoteDrift you get a blank canvas immediately — no sign-up,
          no login. The canvases you create this way are stored{" "}
          <span className="text-nd-text">on your own device</span> using your
          browser&apos;s storage (IndexedDB for canvas documents, and local
          storage for the page list and preferences such as the grid toggle).
        </p>
        <LegalList
          items={[
            "This local work is not sent to us and is not associated with any account.",
            "It stays in the browser you created it in; clearing your browser data removes it.",
            "You can keep unlimited local canvases without ever creating an account.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Accounts and authentication">
        <p>
          You can optionally create an account to use cloud features. Accounts and
          sign-in are provided through <span className="text-nd-text">Supabase</span>,
          our authentication and database provider, acting as our processor.
        </p>
        <LegalList
          items={[
            "Signing in with a magic link uses your email address to send and verify that link.",
            "If you use an optional third-party sign-in provider, that provider authenticates you and shares basic account identifiers with us.",
            "Your signed-in session is kept in secure cookies so you stay logged in. These are functional cookies, not advertising cookies.",
            "Signing in does not upload any of your existing local canvases.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Cloud canvases (only when you choose)">
        <p>
          Saving to the cloud is always an explicit action. A canvas becomes a
          cloud canvas only when you, while signed in, choose{" "}
          <span className="text-nd-text">Save to cloud</span> for it. When you do:
        </p>
        <LegalList
          items={[
            "The canvas document (your text, shapes and drawing) is stored for your account so you can open it on your other devices.",
            "Images you place on a cloud canvas are stored as content-addressed files in a private storage bucket scoped to your account.",
            "Cloud data is isolated per account — one account can never read or sync another account's canvases.",
            "Deleting a cloud canvas removes its stored document, and image files no longer referenced by any of your canvases can be cleaned up.",
          ]}
        />
        <p>
          Your local copy is always saved independently first; cloud sync never
          replaces your local-first workflow.
        </p>
      </LegalSection>

      <LegalSection heading="Payments (NoteDrift Pro)">
        <p>
          NoteDrift Pro subscriptions are processed by{" "}
          <span className="text-nd-text">Stripe</span>. Stripe handles the checkout
          and your payment details directly.
        </p>
        <LegalList
          items={[
            "NoteDrift does not receive or store your full card number, CVC, or similar payment card details — Stripe processes those.",
            "We store only the billing state needed to run your subscription: a Stripe customer and subscription identifier, plan and interval, status, and renewal date.",
            "Stripe processes your payment information under its own privacy policy.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Free file tools">
        <p>
          The converters under <span className="text-nd-text">/tools</span> (image
          and PDF conversion, compression and resizing, and the PDF editor) run
          entirely in your browser. The files you choose are read into your
          browser&apos;s memory, processed on the page, and offered back to you as a
          download. <span className="text-nd-text">Your files are not uploaded</span>{" "}
          to NoteDrift or any third party.
        </p>
      </LegalSection>

      <LegalSection heading="Audio tools and the microphone">
        <LegalList
          items={[
            <>
              <span className="text-nd-text">Sound Meter</span> asks for microphone
              access only when you start it, and analyzes the incoming sound level
              live in your browser. The microphone audio is not recorded, uploaded,
              or stored, and access is released when you stop the meter.
            </>,
            <>
              <span className="text-nd-text">Tap BPM</span> needs no microphone — it
              only measures the timing of your taps.
            </>,
            <>
              <span className="text-nd-text">Metronome</span> generates its click
              sound locally in your browser and records nothing.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="Cookies, storage and analytics">
        <p>
          NoteDrift uses your browser&apos;s local storage and IndexedDB to keep
          your local canvases and preferences, and — only when you are signed in —
          functional cookies to maintain your session. NoteDrift does not run
          third-party advertising or cross-site tracking, and does not sell your
          data. Our infrastructure providers (Supabase for accounts and cloud data,
          Stripe for payments) process technical data as needed to provide those
          services.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <LegalList
          items={[
            "Local canvases: you control them through your browser and can remove them by clearing site data.",
            "Account and cloud data: you can request access to or deletion of your account data by contacting us.",
            "Subscription: you can manage or cancel your Pro subscription at any time through the Stripe billing portal linked in the app.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about this policy or your data can be sent to {email}.</p>
      </LegalSection>
    </LegalPage>
  );
}
