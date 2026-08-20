#!/usr/bin/env node

import { resolveCustomerRating } from '../src/domain/preaudit/customer-rating.ts';

const input = process.argv.slice(2).join(' ').trim();
if (!input) {
  process.stderr.write('用法：npm run customer-rating -- "<客户评级原始值>"\n');
  process.exitCode = 2;
} else {
  process.stdout.write(`${JSON.stringify(resolveCustomerRating(input))}\n`);
}
