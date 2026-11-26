import { getFreeDb } from "@/lib/free/db";

/**
 * Ad events and daily spend. The free host keeps this in the same SQLite (or
 * JSON) file as the rest of the app. Tests and a host with no file database
 * keep an in-memory copy so the logic still runs.
 */

export type AdsEventName = "PageView" | "ViewContent" | "Lead" | "Contact" | "Schedule" | "Purchase";

export const ADS_EVENTS: readonly AdsEventName[] = ["PageView", "ViewContent", "Lead", "Contact", "Schedule", "Purchase"];

export interface StoredEvent {
  id: string;
  name: AdsEventName;
  at: string;
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
  landing: string;
  emailHash?: string;
  value?: number;
  currency?: string;
  test?: boolean;
}

export interface SpendRow {
  id: string;
  date: string;
  source: string;
  campaign: string;
  amount: number;
  currency: string;
}

interface Ledger {
  events: StoredEvent[];
  spend: SpendRow[];
}

const ORG = "local";
const KIND = "ads-ledger";
const MAX_EVENTS = 4000;

const memory = new Map<string, Ledger>();

function blank(): Ledger {
  return { events: [], spend: [] };
}

function load(): Ledger {
  const db = getFreeDb();
  if (db) {
    const doc = db.readDoc<Ledger>(ORG, KIND);
    if (doc && Array.isArray(doc.events) && Array.isArray(doc.spend)) return doc;
  }
  return memory.get(ORG) ?? blank();
}

function save(ledger: Ledger): void {
  const next: Ledger = {
    events: ledger.events.slice(-MAX_EVENTS),
    spend: ledger.spend.slice(-2000),
  };
  const db = getFreeDb();
  if (db) db.writeDoc(ORG, KIND, next);
  else memory.set(ORG, next);
}

export function __resetAdsForTests(): void {
  memory.clear();
  const db = getFreeDb();
  if (db) db.writeDoc(ORG, KIND, blank());
}

export function listAds(): { events: StoredEvent[]; spend: SpendRow[] } {
  const ledger = load();
  return { events: ledger.events, spend: ledger.spend };
}

/** Insert an event. A repeated id is a no-op so browser and server retries don't double-count. */
export function putEvent(event: StoredEvent): { duplicate: boolean } {
  const ledger = load();
  if (ledger.events.some((e) => e.id === event.id)) return { duplicate: true };
  ledger.events.push(event);
  save(ledger);
  return { duplicate: false };
}

export function deleteSpend(id: string): boolean {
  const ledger = load();
  const next = ledger.spend.filter((row) => row.id !== id);
  if (next.length === ledger.spend.length) return false;
  save({ ...ledger, spend: next });
  return true;
}

export function putSpend(row: SpendRow): void {
  const ledger = load();
  const idx = ledger.spend.findIndex((s) => s.date === row.date && s.campaign === row.campaign && s.source === row.source);
  if (idx >= 0) ledger.spend[idx] = row;
  else ledger.spend.push(row);
  save(ledger);
}

/** Last campaign touch we have seen for this hashed email, so a later Stripe sale can inherit it. */
export function touchForEmail(emailHash: string | undefined): Pick<StoredEvent, "source" | "medium" | "campaign" | "content" | "term" | "landing"> | null {
  if (!emailHash) return null;
  const events = load().events;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.emailHash === emailHash && e.campaign) {
      return { source: e.source, medium: e.medium, campaign: e.campaign, content: e.content, term: e.term, landing: e.landing };
    }
  }
  return null;
}
