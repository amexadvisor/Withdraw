import { NextResponse } from 'next/server';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';

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

    const client = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TONCENTER_API_KEY, 
    });

    const mnemonic = process.env.WALLET_MNEMONIC.split(' ');
    const key = await mnemonicToWalletKey(mnemonic);
    
    const wallet = WalletContractV4.create({ publicKey: key.publicKey, workchain: 0 });
    const contract = client.open(wallet);

    const sendAmount = amount.toString(); 
    const seqno = await contract.getSeqno();

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
