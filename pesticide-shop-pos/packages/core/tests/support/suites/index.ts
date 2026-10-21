import { describe } from 'vitest';
import type { WorldFactory } from '../world.js';
import { defineAtomicityTests } from './atomicity.js';
import { defineCatalogueTests } from './catalogue.js';
import { defineCatalogueListTests } from './catalogue-list.js';
import { defineCustomerKhataTests } from './customer-khata.js';
import { defineCustomerTests } from './customers.js';
import { defineContractTests } from './contract.js';
import { defineDirectoryTests } from './directory.js';
import { defineLedgerSeqTests } from './ledger-seq.js';
import { definePaymentKhataTests } from './payment-khata.js';
import { definePurchaseTests, defineStockTests } from './purchase-stock.js';
import { defineSaleTests } from './sale.js';
import { defineSaleQuoteTests } from './sale-quote.js';
import { defineSalesReturnTests } from './sales-return.js';
import { defineScenarioTests } from './scenario.js';

/**
 * ONE suite for every backend. Call it once per backend with a factory that builds a world.
 * If two backends behave differently, the same test passes on one and fails on the other.
 */
export function defineServiceSuites(label: string, make: WorldFactory): void {
  describe(label, () => {
    defineContractTests(make);
    defineSaleTests(make);
    defineSaleQuoteTests(make);
    definePurchaseTests(make);
    defineStockTests(make);
    definePaymentKhataTests(make);
    defineCustomerTests(make);
    defineCustomerKhataTests(make);
    defineSalesReturnTests(make);
    defineCatalogueTests(make);
    defineCatalogueListTests(make);
    defineDirectoryTests(make);
    defineLedgerSeqTests(make);
    defineAtomicityTests(make);
    defineScenarioTests(make);
  });
}

export { runPurchaseSaleReturnScenario, type ScenarioResult } from './scenario.js';
