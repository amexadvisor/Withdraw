import { NextResponse } from 'next/server';
import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';

export const runtime = 'nodejs';

// Retries a request a few times if TonCenter returns 429 (rate limited),
// waiting longer between each attempt. This is what was missing —
// the wallet/transaction code was already correct.
async function withRetry(fn, { retries = 4, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;
      const isRateLimit = status === 429;
      if (!isRateLimit || attempt === retries) {
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt); // 1.5s, 3s, 6s, 12s
      console.warn(`TonCenter rate limited (429). Retry ${attempt + 1}/${retries} in ${delay}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.AUTH_SECRET}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { address, amount } = await req.json();
    if (!address || !amount) {
      return NextResponse.json({ success: false, error: 'Missing address or amount' }, { status: 400 });
    }

    // Add TONCENTER_API_KEY in your env vars to get a much higher rate
    // limit than the shared public endpoint. Get a free key from
    // @tonapibot on Telegram or the toncenter.com docs.
    const client = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TONCENTER_API_KEY, // undefined is fine, just stays on public tier
    });

    if (!process.env.WALLET_MNEMONIC) {
      throw new Error('WALLET_MNEMONIC env var is not set');
    }
    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');
    const keyPair = await mnemonicToWalletKey(mnemonic);

    const wallet = WalletContractV5R1.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
    });
    const contract = client.open(wallet);

    const sendAmount = amount.toString();

    const seqno = await withRetry(() => contract.getSeqno());

    await withRetry(() =>
      contract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: address,
            value: sendAmount,
            body: 'GRAM Payout',
            bounce: false,
          }),
        ],
      })
    );

    return NextResponse.json({ success: true, message: 'Transaction broadcasted' });
  } catch (error) {
    console.error('Withdrawal Error:', error);
    const status = error?.response?.status === 429 ? 429 : 500;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
