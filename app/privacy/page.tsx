import Link from "next/link";
export default function Privacy() {
  return (
    <main className="privacy-page">
      <Link className="wordmark" href="/">
        image / image
      </Link>
      <h1>Your photos, your business.</h1>
      <p>
        We use your photos to help you make ads. We do not train models on your
        photos or opt in to provider data sharing.
      </p>
      <h2>Where your images go</h2>
      <p>
        Product detection runs locally in your browser with U-2-Netp. Model
        files load from this app; your photo stays on your device during
        selection. When you request an AI edit or text detection, your image and
        instructions are sent to OpenAI. API data is not used for training by
        default. Standard abuse-monitoring logs may be retained for up to 30
        days, and safety or legal exceptions can apply. This app does not claim
        zero data retention.
      </p>
      <h2>Storage and deletion</h2>
      <p>
        Photos and versions are stored in private Vercel Blob storage and Neon
        Postgres, accessible to your signed-in account. Use Delete project in
        the editor to remove that project’s files and versions from the app.
        This does not immediately delete provider safety logs or infrastructure
        backups. Operational usage records and export events do not contain your
        photo.
      </p>
      <h2>Product protection</h2>
      <p>
        AI creates or edits the background. Your product cutout comes from the
        original uploaded photo. Lighting and color adjustments can change its
        appearance, but do not generate new product detail. Check the selection
        before editing; fine edges and transparent objects may need manual
        refinement.
      </p>
      <p>
        <a href="https://developers.openai.com/api/docs/guides/your-data">
          OpenAI API data controls
        </a>{" "}
        · <Link href="/">Back to projects</Link>
      </p>
    </main>
  );
}
