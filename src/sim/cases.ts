// Pass 3 ledger cases (Home Office Tycoon style). Every answer is worked out from the generated
// documents with debit/credit logic; nothing is a random "pick the right letter".
import { mulberry32 } from './rng';
import { ACCOUNTS, type Account } from './ledger';

export interface CaseOption { label: string; ok: boolean; why: string }
export interface CaseQuestion { prompt: string; options: CaseOption[] }
export interface LedgerCase {
  kind: 'reconcile' | 'invoice' | 'audit';
  title: string;
  brief: string;
  docs: { title: string; rows: string[][] }[];
  questions: CaseQuestion[];
  fraud: boolean;            // an invoice case with a fake vendor: catching it pleases the Watch
}

const j = (d: Account, c: Account, amt: number) => `Debit ${ACCOUNTS[d].name} ${amt}, credit ${ACCOUNTS[c].name} ${amt}`;
function shuffle<T>(r: () => number, a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; }

// ---------- Reconciliation: the cash book against the strongbox count and the Trust statement ----------
type Err = { kind: 'fee' | 'dupReceipt' | 'transposed' | 'unrecordedSale'; line: string; fixD: Account; fixC: Account; amount: number; bookEffect: number; why: string };

export function makeReconcile(seed: number): LedgerCase {
  const r = mulberry32(seed * 31 + 5);
  const client = ['The Gilded Tankard', 'Sera Vint, general store', 'Dorran Kade, smith'][Math.floor(r() * 3)];
  const opening = 120 + Math.floor(r() * 80);
  const rec: { d: string; amt: number }[] = [];
  const realIn = [20 + Math.floor(r() * 30), 15 + Math.floor(r() * 25)];
  const realOut = [10 + Math.floor(r() * 20)];
  rec.push({ d: 'Cash sales, market day', amt: realIn[0] });
  rec.push({ d: 'Watch paid its account', amt: realIn[1] });
  rec.push({ d: 'Paid for lamp oil', amt: -realOut[0] });
  // choose two errors
  const pool: Err[] = [];
  const fee = 2 + Math.floor(r() * 5);
  pool.push({ kind: 'fee', line: `Trust statement: "Handling fee ${fee}" — not in the cash book`, fixD: 'expenses', fixC: 'cash', amount: fee, bookEffect: 0, why: 'The fee left the account but was never booked: it is an expense paid from cash.' });
  pool.push({ kind: 'dupReceipt', line: `Cash book: "Watch paid its account ${realIn[1]}" appears twice`, fixD: 'receivable', fixC: 'cash', amount: realIn[1], bookEffect: realIn[1], why: 'The second copy overstated cash and wrongly cleared what the Watch owes. Reverse it: debit receivable, credit cash.' });
  let a = 40 + Math.floor(r() * 50); let b = Number(String(a).split('').reverse().join('')); if (b === a) { a = 63; b = 36; }
  const hi = Math.max(a, b), lo = Math.min(a, b);
  pool.push({ kind: 'transposed', line: `Cash book: sale booked as ${hi}; the receipt slip says ${lo}`, fixD: 'sales', fixC: 'cash', amount: hi - lo, bookEffect: hi - lo, why: `Digits swapped. Sales and cash are both overstated by ${hi - lo}: debit sales, credit cash for the difference.` });
  const uns = 8 + Math.floor(r() * 15);
  pool.push({ kind: 'unrecordedSale', line: `Strongbox holds a receipt slip for a ${uns}-crown cash sale that is not in the book`, fixD: 'cash', fixC: 'sales', amount: uns, bookEffect: -uns, why: 'Coin came in from a sale but was never booked: debit cash, credit sales.' });
  const errs = shuffle(r, pool).slice(0, 2);
  // Build the cash book as recorded
  const book = rec.map(x => ({ ...x }));
  for (const e of errs) {
    if (e.kind === 'dupReceipt') book.push({ d: 'Watch paid its account', amt: realIn[1] });
    if (e.kind === 'transposed') book.push({ d: 'Cash sale, cloth', amt: hi });
  }
  const trueRec = rec.map(x => ({ ...x }));
  for (const e of errs) { if (e.kind === 'transposed') trueRec.push({ d: 'Cash sale, cloth', amt: lo }); if (e.kind === 'unrecordedSale') trueRec.push({ d: 'Cash sale, slip', amt: uns }); if (e.kind === 'fee') trueRec.push({ d: 'Handling fee', amt: -fee }); }
  const bookBal = opening + book.reduce((s, x) => s + x.amt, 0);
  const trueBal = opening + trueRec.reduce((s, x) => s + x.amt, 0);
  const diff = bookBal - trueBal;
  const docs = [
    { title: `Cash book — ${client}`, rows: [['Opening balance', String(opening)], ...book.map(x => [x.d, (x.amt > 0 ? '+' : '') + x.amt]), ['Book balance', String(bookBal)]] },
    { title: 'Strongbox count + Trust statement', rows: [['Coin counted and held at the Trust', String(trueBal)], ...errs.map(e => ['Note', e.line])] },
  ];
  const accounts: Account[] = ['cash', 'receivable', 'sales', 'expenses', 'payable'];
  const questions: CaseQuestion[] = [];
  questions.push({
    prompt: `The book says ${bookBal}; the count says ${trueBal}. Which is the gap the corrections must close?`,
    options: shuffle(r, [
      { label: `${Math.abs(diff)} — the book is ${diff > 0 ? 'over' : 'under'}stated`, ok: true, why: `${bookBal} − ${trueBal} = ${diff}.` },
      { label: `${Math.abs(diff) + 10}`, ok: false, why: `Subtract carefully: ${bookBal} − ${trueBal} = ${diff}.` },
      { label: `${Math.abs(bookBal - opening)}`, ok: false, why: 'That is the movement for the month, not the gap.' },
    ]),
  });
  for (const e of errs) {
    const opts: CaseOption[] = [{ label: j(e.fixD, e.fixC, e.amount), ok: true, why: e.why }];
    opts.push({ label: j(e.fixC, e.fixD, e.amount), ok: false, why: `Right accounts, wrong sides. ${e.why}` });
    const other = accounts.filter(x => x !== e.fixD && x !== e.fixC);
    opts.push({ label: j(other[Math.floor(r() * other.length)], e.fixC, e.amount), ok: false, why: e.why });
    if (e.kind === 'transposed') opts.push({ label: j(e.fixD, e.fixC, hi), ok: false, why: `Only the difference is wrong (${hi} − ${lo} = ${hi - lo}), not the whole sale.` });
    questions.push({ prompt: `Correct this: ${e.line}`, options: shuffle(r, opts) });
  }
  return { kind: 'reconcile', title: `Reconcile the cash of ${client}`, brief: 'Brannic: "The count and the book disagree. Find out why and post the corrections. Two errors, I\'d wager."', docs, questions, fraud: false };
}

// ---------- Invoice investigation: three-way match (order, goods received, invoice) ----------
type Inv = { id: string; vendor: string; item: string; poQty: number; grnQty: number | null; price: number; invQty: number; invPrice: number; paidBefore: boolean; knownVendor: boolean };

export function makeInvoice(seed: number): LedgerCase {
  const r = mulberry32(seed * 47 + 11);
  const vendors = ['Kade Ironworks', 'Fen Herbals', 'Vale Timber Co.', 'Thatch Mill'];
  const fake = 'Ashroad Supply Ltd.';
  const items = ['nails (box)', 'lamp oil (cask)', 'planks', 'flour (sack)'];
  const invs: Inv[] = [];
  const kinds = shuffle(r, ['clean', 'overQty', 'overPrice', 'duplicate', 'fake'] as const).slice(0, 3);
  if (!kinds.includes('clean')) kinds[0] = 'clean';
  kinds.forEach((k, i) => {
    const qty = 4 + Math.floor(r() * 8), price = 3 + Math.floor(r() * 6);
    const inv: Inv = { id: `INV-${310 + i * 7 + Math.floor(r() * 5)}`, vendor: vendors[i % vendors.length], item: items[i % items.length], poQty: qty, grnQty: qty, price, invQty: qty, invPrice: price, paidBefore: false, knownVendor: true };
    if (k === 'overQty') { inv.grnQty = qty - 2; inv.invQty = qty; }
    if (k === 'overPrice') inv.invPrice = price + 2;
    if (k === 'duplicate') inv.paidBefore = true;
    if (k === 'fake') { inv.vendor = fake; inv.knownVendor = false; inv.grnQty = null; inv.poQty = 0; }
    invs.push(inv);
  });
  const docs = [
    { title: 'Purchase orders', rows: invs.filter(x => x.poQty > 0).map(x => [x.vendor, `${x.poQty} × ${x.item} @ ${x.price}`]) },
    { title: 'Goods received notes', rows: invs.filter(x => x.grnQty !== null).map(x => [x.vendor, `${x.grnQty} × ${x.item} received`]) },
    { title: 'Invoices on Brannic\'s desk', rows: invs.map(x => [x.id, `${x.vendor}: ${x.invQty} × ${x.item} @ ${x.invPrice} = ${x.invQty * x.invPrice}`]) },
    { title: 'Payments already made', rows: invs.filter(x => x.paidBefore).map(x => [x.id, `Paid ${x.invQty * x.invPrice} last week`]).concat([['—', 'Vendors on file: ' + vendors.join(', ')]]) },
  ];
  const questions: CaseQuestion[] = invs.map(x => {
    const billed = x.invQty * x.invPrice;
    const fair = (x.grnQty ?? 0) * x.price;
    const approve = `Approve ${billed}: ${j('inventory', 'payable', billed)}`;
    const approveFair = `Approve ${fair} only: ${j('inventory', 'payable', fair)}`;
    const reject = 'Reject as a duplicate — it was already paid';
    const flag = 'Refuse and report: no order, no delivery, unknown vendor';
    const wrongSide = `Approve ${billed}: ${j('payable', 'inventory', billed)}`;
    const cashNow = `Pay in coin now: ${j('inventory', 'cash', billed)}`;
    let correct: string, why: string;
    if (!x.knownVendor) { correct = flag; why = 'There is no purchase order or delivery note and the vendor is not on file. Paying it would be paying a fraud.'; }
    else if (x.paidBefore) { correct = reject; why = `${x.id} already appears in payments. Posting it again would double the liability.`; }
    else if (x.grnQty !== x.invQty || x.invPrice !== x.price) { correct = approveFair; why = `Pay for what was ordered and received: ${x.grnQty} × ${x.price} = ${fair}. Stock comes in (debit inventory), and we owe the vendor (credit payable).`; }
    else { correct = approve; why = 'Order, delivery and invoice match. Stock in (debit inventory) and a debt to the vendor (credit payable).'; }
    const labels = [...new Set([approve, approveFair, reject, flag, wrongSide, cashNow])].filter(l => l === correct || r() < 0.75 || l === approve).slice(0, 5);
    if (!labels.includes(correct)) labels.push(correct);
    return {
      prompt: `${x.id} from ${x.vendor} for ${billed} crowns. What do you do?`,
      options: shuffle(r, labels.map(l => ({ label: l, ok: l === correct, why: l === correct ? why : l === wrongSide ? 'Right accounts, wrong sides: receiving stock debits inventory.' : l === cashNow ? 'It is bought on credit: the payable is settled later, not cash now.' : why }))),
    };
  });
  return { kind: 'invoice', title: 'Invoice investigation for the Counting House', brief: 'Brannic: "Three invoices. Match each against the order and the delivery note before a single crown leaves this house."', docs, questions, fraud: kinds.includes('fake') };
}

export function makeCase(day: number, seed: number, n: number): LedgerCase {
  return (day + n) % 2 === 0 ? makeReconcile(day * 13 + seed + n) : makeInvoice(day * 17 + seed + n);
}

// ---------- The Voss audit (quest "Red Ink") ----------
// Ysolde repaid 120 crowns that the Tower's clerk received in cash but credited to income instead of
// to her loan, and a year of ward-tax was "spent" on maintenance with no vouchers. Real corrections.
export function makeAudit(bookDebt: number): LedgerCase {
  const paid = 120, tax = 240, trueBal = Math.max(0, bookDebt - paid);
  const opt = (label: string, ok: boolean, why: string): CaseOption => ({ label, ok, why });
  return {
    kind: 'audit', fraud: true,
    title: 'The Voss debt book',
    brief: 'Brannic: "Tolan is out until two. Your aunt\'s page first. Then the ward-tax. Be exact: one slip and the Tower\'s lawyers will eat you."',
    docs: [
      { title: "Ysolde Hale's own receipt book (found in her notebook)", rows: [['8 receipts, each "Received of Y. Hale, 15 crowns, on account of loan. — T."', '8 × 15'], ['Dates', 'the first of each month, last year']] },
      { title: 'Tower debt book — page "Hale, Y."', rows: [['Loan advanced', '300'], ['Repayments posted', 'none'], ['Balance shown today', String(bookDebt)]] },
      { title: 'Tower cash book — extract', rows: [['Cash received "Y. Hale" × 8', '+120'], ['Credited to', 'Sundry income'], ['Ward-tax collected from the town, this year', '+' + tax], ['Paid out: "ward maintenance, Old Mill and pilgrim road"', '−' + tax], ['Vouchers for maintenance', 'none on file'], ['Paid to', '"petty cash, held by T."']] },
    ],
    questions: [
      { prompt: "How much did Ysolde repay, by her own receipts?", options: [opt('120 crowns', true, '8 receipts × 15 crowns = 120.'), opt('105 crowns', false, '8 × 15 is 120, not 105.'), opt('135 crowns', false, 'There are 8 receipts, not 9: 8 × 15 = 120.'), opt('Nothing: the debt book shows no repayments', false, 'The debt book is what is being tested. The signed receipts and the cash book both show the money arrived.')] },
      { prompt: 'The cash book shows the Tower did receive that money. What went wrong with the other side of the entry?', options: [
        opt('It was credited to Sundry income; it should have been credited to Loans receivable, reducing what Ysolde owed', true, 'A repayment is not income. It reduces the asset (the loan), so the credit belongs on Loans receivable.'),
        opt('Nothing: repayments of a loan are income to the lender', false, 'Only the interest is income. Repaid principal reduces the loan asset.'),
        opt('It should have been debited to Loans receivable', false, 'A debit would increase the loan. Repayments credit the loan account.'),
        opt('The cash was never banked', false, 'The cash book shows it received. The problem is the account it was credited to.')] },
      { prompt: "What journal corrects the Tower's books for Ysolde's repayments?", options: [
        opt('Debit Sundry income 120, credit Loans receivable 120', true, 'Take the 120 out of income (debit) and put it against the loan (credit). Cash was already right.'),
        opt('Debit Loans receivable 120, credit Sundry income 120', false, 'That is the same mistake made a second time, the other way up.'),
        opt('Debit Cash 120, credit Loans receivable 120', false, 'Cash was already debited when the money came in. Debiting it again counts the same coin twice.'),
        opt('Debit Loans receivable 120, credit Cash 120', false, 'That records a new loan paid out, which never happened.')] },
      { prompt: `The page shows ${bookDebt} crowns owing today. What is the true balance once the journal is posted?`, options: [
        opt(`${trueBal} crowns`, true, `${bookDebt} − 120 = ${trueBal}.`), opt(`${bookDebt + paid} crowns`, false, 'Repayments reduce the balance; they do not add to it.'), opt(`${bookDebt} crowns: the receipts are too old to count`, false, 'A receipt does not expire. The money was paid and must be credited.'), opt(`${Math.max(0, bookDebt - 105)} crowns`, false, 'The repayments total 120.')] },
      { prompt: `Ward-tax: ${tax} collected, ${tax} booked as maintenance with no vouchers, the cash handed to the clerk. How do you treat it?`, options: [
        opt(`Reverse the expense and show the clerk as owing it: debit "Due from clerk" ${tax}, credit Ward maintenance ${tax}; report it`, true, 'With no voucher there is no evidence of an expense, and the cash sits with the bookkeeper. It is a receivable from him until he accounts for it.'),
        opt('Leave it: the expense matches the tax, so the book balances', false, 'A book can balance and still be false. An expense needs evidence that the work was done and paid for.'),
        opt(`Debit Ward maintenance ${tax}, credit Cash ${tax} again`, false, 'That would record the same unsupported payment twice.'),
        opt(`Debit Cash ${tax}, credit Ward-tax income ${tax}`, false, 'The tax income was already recorded correctly. The false entry is the expense.')] },
    ],
  };
}
