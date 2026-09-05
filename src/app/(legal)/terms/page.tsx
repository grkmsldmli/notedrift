import type { Metadata } from "next";
import { PRICING } from "@/lib/plans";
import {
  LEGAL_CONTACT_EMAIL,
  LegalList,
  LegalPage,
  LegalSection,
} from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | NoteDrift",
  description:
    "The terms for using NoteDrift: your content stays yours, Free vs Pro, subscription and cancellation, and honest limitations of the free tools.",
  alternates: { canonical: "/terms" },
};

const money = (n: number) => `$${n.toFixed(2)}`;
const email = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-nd-accent hover:underline">{LEGAL_CONTACT_EMAIL}</a>;

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms apply when you use NoteDrift, including the canvas editor, the
        free file and audio tools, and NoteDrift Pro. By using NoteDrift you agree
        to them.
      </p>

      <LegalSection heading="Using NoteDrift">
        <p>
          NoteDrift is instant, local-first digital paper. You may use it for your
          own personal or work purposes. You are responsible for the content you
          create and for using NoteDrift lawfully.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <LegalList
          items={[
            "An account is optional and only needed for cloud features.",
            "You are responsible for keeping access to your account (for example, access to the email address used to sign in) secure.",
            "You must be able to form a binding agreement to use an account and to subscribe.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Your content is yours">
        <p>
          You keep all rights to the canvases, drawings, text and files you create.
          NoteDrift does not claim ownership of your content. To provide cloud
          features, you grant NoteDrift only the limited permission needed to
          store, back up, and display <span className="text-nd-text">your own</span>{" "}
          cloud content back to you across your devices, and to process it as
          required to operate the service. That permission exists only to run the
          service and ends for content you delete.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <LegalList
          items={[
            "use NoteDrift to break the law or infringe others' rights;",
            "attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to the service or other users' data;",
            "misuse the free tools to process content you have no right to.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Free and Pro">
        <p>
          NoteDrift&apos;s core creation tools and unlimited local canvases are free.
          A free account can keep up to 3 cloud canvases. NoteDrift Pro adds
          unlimited cloud canvases. Losing Pro is non-destructive: your existing
          cloud canvases remain readable and editable, and only creating new cloud
          canvases beyond the free limit is paused.
        </p>
      </LegalSection>

      <LegalSection heading="Subscriptions, pricing and renewal">
        <LegalList
          items={[
            <>
              NoteDrift Pro is a recurring subscription, billed either monthly
              ({money(PRICING.monthly)} per month) or yearly ({money(PRICING.annual)}{" "}
              per year).
            </>,
            "Payments are processed by Stripe. Prices are shown in US dollars and exclude any taxes that may apply.",
            "Your subscription renews automatically at the end of each billing period unless you cancel before it renews.",
            "You can cancel at any time through the Stripe billing portal linked in the app. When you cancel, Pro access continues until the end of the period you have already paid for, and then does not renew.",
          ]}
        />
        <p className="text-xs">
          Current prices may change for future billing periods; any change is shown
          before it applies to you.
        </p>
      </LegalSection>

      <LegalSection heading="Free tools — honest limitations">
        <LegalList
          items={[
            <>
              <span className="text-nd-text">Sound Meter</span> gives an approximate
              sound-level reading from your device&apos;s microphone. It is a rough
              indicator only — it is <span className="text-nd-text">not</span> a
              calibrated or certified professional sound-level (SPL) meter and must
              not be relied on for hearing-safety, occupational, legal, or medical
              decisions.
            </>,
            <>
              The PDF editor&apos;s <span className="text-nd-text">whiteout / cover</span>{" "}
              tool draws an opaque shape over content. It is not secure redaction —
              it does not remove the underlying content from the file — so do not
              use it to hide sensitive information you need permanently removed.
            </>,
            "The file and audio tools are provided for convenience and process your files in your browser; results are provided as-is.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="Service availability">
        <p>
          NoteDrift is provided on an &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo; basis. We work to keep it running, but we do not
          guarantee that it will be uninterrupted, error-free, or available at all
          times, and features may change. Because NoteDrift is local-first, keeping
          your own copies of important work (for example, exporting a PNG) is always
          a good idea.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the extent permitted by law, NoteDrift is not liable for indirect,
          incidental, or consequential damages, or for loss of data, arising from
          your use of the service. Nothing in these terms limits rights that cannot
          be limited under applicable law.
        </p>
      </LegalSection>

      <LegalSection heading="Changes and contact">
        <p>
          We may update these terms as NoteDrift evolves; material changes will be
          reflected here with a new date above. Questions about these terms can be
          sent to {email}.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
