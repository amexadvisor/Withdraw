import { NextResponse } from 'next/server';
import * as TonSdk from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';

// Force Node runtime — @ton/ton needs Node's crypto internals,
// and Edge runtime can silently break its exports under bundling.
export const runtime = 'nodejs';

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

    // Destructure from the namespace import instead of importing
    // named exports directly — this avoids a known Turbopack
    // ESM/CJS interop bug where named class exports resolve to undefined.
    const { TonClient, WalletContractV5R1, internal } = TonSdk;

    if (!WalletContractV5R1) {
      // Fails loudly and clearly instead of "Cannot read properties of undefined"
      throw new Error(
        'WalletContractV5R1 failed to resolve from @ton/ton. Check package version (need 16.x) and for duplicate @ton/core installs.'
      );
    }

    const client = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
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
    const seqno = await contract.getSeqno();

    await contract.sendTransfer({
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
    });

    return NextResponse.json({ success: true, message: 'Transaction broadcasted' });
  } catch (error) {
    console.error('Withdrawal Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
