import { Router, Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

router.post('/check-token', async (req: Request, res: Response) => {
  const { ownerAddress, mintAddress } = req.body;

  if (!ownerAddress || !mintAddress) {
    return res.status(400).json({ error: 'Missing ownerAddress or mintAddress' });
  }

  if (!HELIUS_API_KEY) {
    console.error('HELIUS_API_KEY is not set in the environment variables.');
    return res.status(500).json({ error: 'Internal server error: Missing API key' });
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'my-id',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          page: 1,
          limit: 1000,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Helius API error:', data.error);
      return res.status(500).json({ error: 'Failed to fetch assets from Helius API' });
    }

    const hasToken = data.result.items.some((asset: any) => asset.id === mintAddress);

    console.log(`Token check for ${ownerAddress}: ${hasToken}`);
    res.json({ hasToken });
  } catch (error) {
    console.error('Error checking for token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
