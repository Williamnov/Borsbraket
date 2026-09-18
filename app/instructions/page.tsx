import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works · BörsBråket",
  description: "The rules of the league: picking, scoring, eligible markets and the weekly price checkpoints.",
};

export default function InstructionsPage() {
  return (
    <article className="prose" style={{ paddingTop: 40 }}>
      <h1>How it works</h1>
      <p style={{ fontSize: 16 }}>
        Everyone picks up to five stocks at the start of the month. Prices are recorded once a
        week. At the end of the month the best return takes the points, and the season table
        decides who is actually good at this.
      </p>

      <h2>Getting in</h2>
      <p>
        The site is public but the league is not. Sign in with your email or a Google account, and
        an admin approves you before you can see anything or pick anything. Until then you sit in
        the waiting room.
      </p>

      <h2>Picking</h2>
      <ul>
        <li>
          <strong>Up to five stocks per month.</strong> Fewer is allowed; more is not. Every holding
          carries the same weight, so three picks means a third each.
        </li>
        <li>
          <strong>One entry per stock.</strong> You cannot double up on the same ticker to
          concentrate a bet.
        </li>
        <li>
          <strong>Picks close on the lock date</strong> shown on the month page — usually a few days
          into the month. After that nothing can be added, swapped or removed.
        </li>
        <li>
          <strong>Nobody sees your picks until the lock.</strong> That is enforced by the database
          rules: other players&rsquo; picks are not sent to your browser at all while the month is
          open.
        </li>
      </ul>

      <h2>Where you can pick from</h2>
      <p>The Nordic lists:</p>
      <ul>
        <li>
          <strong>Sweden</strong> — Large, Mid and Small Cap Stockholm, First North, Spotlight, NGM,
          NGM PepMarket, Nordic SME Sweden
        </li>
        <li>
          <strong>Finland</strong> — Large, Mid and Small Cap Helsinki, First North Finland
        </li>
        <li>
          <strong>Denmark</strong> — Large, Mid and Small Cap Copenhagen, First North Denmark,
          Spotlight Denmark
        </li>
        <li>
          <strong>Norway</strong> — Oslo Børs, Euronext Expand Oslo, Euronext Growth Oslo
        </li>
        <li>
          <strong>Iceland</strong> — Large, Mid and Small Cap Iceland, First North Iceland
        </li>
      </ul>
      <p>Plus the main North American and UK markets:</p>
      <ul>
        <li>
          <strong>United States</strong> — NYSE, Nasdaq and NYSE American, which between them cover
          the S&amp;P 500
        </li>
        <li>
          <strong>Canada</strong> — Toronto Stock Exchange
        </li>
        <li>
          <strong>United Kingdom</strong> — London Stock Exchange main market
        </li>
      </ul>

      <h3>No penny stocks</h3>
      <p>
        A stock that can move 1000% in a week turns the league into a lottery, so the pickable list
        is curated. Only instruments an admin has marked eligible can be picked, and that is
        checked when your picks are saved — not merely hidden in the interface.
      </p>
      <p>
        The test is <strong>company size, not share price</strong>. Plenty of perfectly serious
        companies trade below one pound or one euro a share; Lloyds and Vodafone are FTSE 100
        members. What gets excluded is the small, thin, easily-moved end of the growth lists.
      </p>
      <p>
        If something you want is missing, ask an admin to add it. Adding a stock takes a few
        seconds in the admin panel.
      </p>

      <h2>Weekly price checkpoints</h2>
      <p>
        Every month has five recorded prices per holding:
      </p>
      <ul>
        <li>
          <strong>Opening price</strong> — taken when the month starts. This is the baseline your
          return is measured from.
        </li>
        <li>
          <strong>Four weekly updates</strong> — recorded once a week while the month runs.
        </li>
      </ul>
      <p>
        Your live return always uses the most recent weekly price that exists, so the table moves
        once a week rather than tick by tick. The weekly bars next to each holding show how the
        month has gone, week by week.
      </p>

      <h2>Scoring</h2>
      <p>
        A holding&rsquo;s return is <code>latest weekly price ÷ opening price − 1</code>. Your
        month is the plain average of your holdings&rsquo; returns — equal weight, no position
        sizing.
      </p>
      <p>
        Returns are measured in each stock&rsquo;s own currency. Dividends and exchange rates are
        ignored. A Stockholm pick and a New York pick are compared on their local performance, which
        keeps the game about stock picking rather than currency timing.
      </p>

      <h3>Points</h3>
      <ul>
        <li>1st place: <strong>10 points</strong></li>
        <li>2nd: <strong>7</strong> · 3rd: <strong>5</strong> · 4th: <strong>4</strong> · 5th: <strong>3</strong> · 6th: <strong>2</strong></li>
        <li>Everyone else who submitted picks: <strong>1 point</strong></li>
        <li>No picks submitted: no points, and the month does not count towards your average</li>
      </ul>
      <p>
        Points are awarded only once an admin settles the month. The season table can be sorted by
        points, by compounded return, by average month or by number of monthly wins — they tell
        different stories, and the argument about which one counts is part of the fun.
      </p>

      <h3>The benchmark</h3>
      <p>
        OMXS30 and the S&amp;P 500 are priced alongside the picks and shown as a reference line.
        They do not compete and cannot be picked. Losing to the index is its own punishment.
      </p>

      <h2>Missing prices</h2>
      <p>
        If a holding has no price yet, it is left out of that month&rsquo;s average rather than
        counted as zero, and the table marks the portfolio as partly priced. Once the admin fills
        the price in, the table catches up on its own.
      </p>

      <h2>Chat</h2>
      <p>
        The <Link href="/chat">Chat</Link> tab is the league&rsquo;s message board: threads with one
        level of replies, visible to every approved player. A posted message cannot be edited by
        anyone, so nobody gets to rewrite a call after the fact — you can delete your own, and
        admins can delete anything. None of it touches the scoring.
      </p>

      <p style={{ marginTop: 36 }}>
        <Link href="/login">Sign in</Link> to join, or head back to the{" "}
        <Link href="/league">league table</Link>.
      </p>
    </article>
  );
}
