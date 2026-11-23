import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signInWithGoogle, signOutUser, signInLocally } from "@/app/actions";
import { UploadButton } from "@/app/upload-button";
import { sql, type Project } from "@/lib/db";
import { formatProjectDate } from "@/lib/project-date";
export default function Home() {
  return (
    <main className="home">
      <nav className="app-nav">
        <Link href="/" className="wordmark">
          image / image
        </Link>
        <Link href="/privacy">Your photos, your business</Link>
      </nav>
      <Suspense fallback={<p className="loading">Opening your studio…</p>}>
        <Dashboard />
      </Suspense>
      <footer className="site-footer">
        <span>Made for the things you make.</span>
        <Link href="/privacy">Privacy & data</Link>
      </footer>
    </main>
  );
}
async function Dashboard() {
  await connection();
  const session = await auth(),
    userId = session?.user?.id;
  if (!userId)
    return (
      <section className="welcome">
        <div className="welcome-copy">
          <h1>
            A real product.
            <br />A better picture.
          </h1>
          <p>
            Turn the photo you already have into the ad you had in mind. New
            settings, beautiful type, and your product’s original details.
          </p>
          <form action={signInWithGoogle}>
            <button className="primary large">Start with Google</button>
          </form>
          {process.env.NODE_ENV === "development" &&
            process.env.LOCAL_DEV_AUTH === "true" && (
              <form action={signInLocally} className="local-login">
                <button>Open local preview</button>
              </form>
            )}
          <p className="fine-print">
            20 free prompts. Manual edits and PNG exports are always free.
          </p>
        </div>
        <div
          className="photo-study"
          aria-label="Illustration of a product photo becoming an ad"
        >
          <div className="study-caption">Your product stays yours.</div>
          <div className="study-ad">
            <div className="bottle">
              <div className="bottle-cap" />
              <div className="bottle-label">
                Everyday
                <br />
                <strong>good.</strong>
                <small>Original details kept.</small>
              </div>
            </div>
            <div className="ad-type">
              A little
              <br />
              everyday good.
            </div>
            <div className="ad-offer">
              Your next great ad starts with a real photo.
            </div>
          </div>
          <div className="study-note">New scene. Real product. Crisp text.</div>
        </div>
      </section>
    );
  await sql`INSERT INTO accounts(user_id) VALUES(${userId}) ON CONFLICT(user_id) DO UPDATE SET last_seen=now()`;
  await sql`INSERT INTO events(user_id,name) VALUES(${userId},'visit')`;
  const projects =
    (await sql`SELECT id,created_at FROM projects WHERE user_id=${userId} ORDER BY created_at DESC`) as Project[];
  const [account] =
    await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
  return (
    <>
      <header className="dashboard-heading">
        <div>
          <h1>
            Your small business.
            <br />
            In a good light.
          </h1>
          <p>Start with a photo. Make something worth sharing.</p>
        </div>
        <div className="account">
          <span>{20 - Number(account.prompts_used)} free prompts left</span>
          <form action={signOutUser}>
            <button>Sign out</button>
          </form>
        </div>
      </header>
      <section className="projects-section">
        <div className="section-heading">
          <h2>
            Your projects <span className="count">{projects.length}</span>
          </h2>
          <UploadButton userId={userId} />
        </div>
        {projects.length ? (
          <ul className="project-grid">
            {projects.map((p) => {
              const date = formatProjectDate(p.created_at);
              return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated private image */}
                  <img
                    src={`/projects/${p.id}/image`}
                    alt="Open your photo project"
                  />
                  <div className="project-caption">
                    <span>Photo project</span>
                    <time dateTime={date.dateTime}>
                      {date.label}
                    </time>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        ) : (
          <div className="empty-projects">
            <div className="empty-frame">
              <span>＋</span>
            </div>
            <h3>Your first ad starts here.</h3>
            <p>
              Upload a product photo from your camera roll.
              <br />
              JPEG, PNG, WebP, and iPhone HEIC up to 20MB.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
