import { NextResponse } from 'next/server';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto'; 
import { getHttpEndpoint } from '@orbs-network/ton-access';

export async function POST(req) {
  try {
    // 1. Verify Authorization Header from TeleBot
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.AUTH_SECRET}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse User Input
    const { address, amount } = await req.json();
    if (!address || !amount) {
      return NextResponse.json({ success: false, error: 'Missing address or amount' }, { status: 400 });
    }

    // 3. Dynamically fetch a healthy, rate-limit-free Orbs node endpoint
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });

    // 4. Generate Key Pair from 12-word Mnemonic
    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');
    const key = await mnemonicToWalletKey(mnemonic);
    
    // 5. Initialize Wallet Contract (V4 standard)
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    // 6. Execute Transfer with Safe Seqno Fallback for Inactive Wallets
    const sendAmount = amount.toString(); 
    
    let seqno = 0;
    try {
      seqno = await contract.getSeqno();
    } catch (e) {
      // Wallet is inactive/uninitialized; seqno defaults to 0 to trigger deployment
      seqno = 0;
    }

    await contract.sendTransfer({
      seqno,
      secretKey: key.secretKey,
      messages: [
        internal({
          to: address,
          value: sendAmount,
          body: 'GRAM Payout', 
          bounce: false,
        })
      ]
    });

    return NextResponse.json({ success: true, message: 'Transaction broadcasted' });

  } catch (error) {
    console.error('Withdrawal Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
