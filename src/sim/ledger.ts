// The Counting House shift. Real double-entry bookkeeping, in the spirit of Home Office Tycoon:
// read a source document, choose the account to debit and the account to credit.
import { mulberry32 } from './rng';

export type Account = 'cash' | 'inventory' | 'receivable' | 'payable' | 'sales' | 'expenses' | 'capital' | 'equipment';
export const ACCOUNTS: Record<Account, { name: string; code: string; kind: 'asset' | 'liability' | 'equity' | 'income' | 'expense' }> = {
  cash: { name: 'Cash in strongbox', code: '1000', kind: 'asset' },
  receivable: { name: 'Owed to us (receivable)', code: '1100', kind: 'asset' },
  inventory: { name: 'Stock (inventory)', code: '1200', kind: 'asset' },
  equipment: { name: 'Tools and equipment', code: '1500', kind: 'asset' },
  payable: { name: 'We owe (payable)', code: '2000', kind: 'liability' },
  capital: { name: 'Owner\'s capital', code: '3000', kind: 'equity' },
  sales: { name: 'Sales', code: '4000', kind: 'income' },
  expenses: { name: 'Running expenses', code: '5000', kind: 'expense' },
};
export const ACCOUNT_ORDER: Account[] = ['cash', 'receivable', 'inventory', 'equipment', 'payable', 'capital', 'sales', 'expenses'];

export interface LedgerEntry { doc: string; client: string; amount: number; debit: Account; credit: Account; hint: string }

const CLIENTS = ['Bram Thatch, baker', 'Sera Vint, general store', 'Dorran Kade, smith', 'The Gilded Tankard', 'Yara Fen, herbalist'];
const TEMPLATES: { make: (c: string, a: number) => string; debit: Account; credit: Account; hint: string }[] = [
  { make: (c, a) => `${c} sold goods to a customer for ${a} crowns, paid in coin on the spot.`, debit: 'cash', credit: 'sales', hint: 'Coin came in; it was earned by selling.' },
  { make: (c, a) => `${c} sold goods for ${a} crowns to the Watch, who will pay at month end.`, debit: 'receivable', credit: 'sales', hint: 'Earned now, paid later: someone owes the business.' },
  { make: (c, a) => `${c} bought ${a} crowns of stock from a Vale trader on credit.`, debit: 'inventory', credit: 'payable', hint: 'More stock, and a debt to the trader.' },
  { make: (c, a) => `${c} paid the Vale trader ${a} crowns owed from last month.`, debit: 'payable', credit: 'cash', hint: 'The debt shrinks and coin leaves.' },
  { make: (c, a) => `${c} received ${a} crowns from the Watch for goods sold last month.`, debit: 'cash', credit: 'receivable', hint: 'Coin arrives; nobody owes it any more.' },
  { make: (c, a) => `${c} paid ${a} crowns in coin for lamp oil and firewood used this week.`, debit: 'expenses', credit: 'cash', hint: 'A cost of running the place, paid in coin.' },
  { make: (c, a) => `The owner of ${c} put ${a} crowns of personal savings into the business.`, debit: 'cash', credit: 'capital', hint: 'Coin in, from the owner rather than a customer.' },
  { make: (c, a) => `${c} bought a new tool for ${a} crowns, paid in coin.`, debit: 'equipment', credit: 'cash', hint: 'An asset that lasts, bought with coin.' },
];

export function generateShift(day: number, salt = 0, count = 5): LedgerEntry[] {
  const r = mulberry32(day * 7919 + salt * 104729 + 17);
  const out: LedgerEntry[] = [];
  for (let i = 0; i < count; i++) {
    const t = TEMPLATES[Math.floor(r() * TEMPLATES.length)];
    const c = CLIENTS[Math.floor(r() * CLIENTS.length)];
    const amount = 5 + Math.floor(r() * 60);
    out.push({ doc: t.make(c, amount), client: c, amount, debit: t.debit, credit: t.credit, hint: t.hint });
  }
  return out;
}

export function checkPosting(e: LedgerEntry, debit: Account, credit: Account): { ok: boolean; why: string } {
  if (debit === credit) return { ok: false, why: 'The same account on both sides moves nothing.' };
  if (debit === e.debit && credit === e.credit) return { ok: true, why: 'Balanced and correct.' };
  if (debit === e.credit && credit === e.debit) return { ok: false, why: 'Right accounts, wrong sides.' };
  return { ok: false, why: `Should be debit ${ACCOUNTS[e.debit].name}, credit ${ACCOUNTS[e.credit].name}. ${e.hint}` };
}
