# Current Costs

## Cost Per Short Summary

| Scenario | Cost Per Short |
|----------|----------------|
| Non-scalable (individual, free tier) | **~$0.003** |
| At scale, without Whisper | **~$0.01** |
| At scale, with Whisper | **~$0.02-0.03** |

---

## At Scale (1,000-5,000 videos/day, 1-2 hours each)

### Without Whisper: ~$0.01 per short

| Category | Monthly Cost |
|----------|--------------|
| Compute (ffmpeg) | $80-300 |
| Bandwidth (egress) | $180-210 |
| Storage (temp, immediate delete) | ~$5 |
| **Total** | ~$265-515/month |

At ~7,500 shorts/day (225,000/month): **~$0.01 per short**

### With Whisper: ~$0.02-0.03 per short

Even with self-hosted Whisper, costs land in this range due to GPU overhead.

| Category | Monthly Cost |
|----------|--------------|
| Compute (ffmpeg) | $80-300 |
| Bandwidth (egress) | $180-210 |
| Whisper (API or self-hosted) | $16-360 |
| GPU instance (if self-hosted) | $150-300 |
| **Total** | ~$450-800/month |

---

## Non-Scalable (Individual Use)

Using free tiers (Google Cloud, local processing, etc.):

**~$0.003 per short**

- Free compute (local machine)
- Free bandwidth (minimal usage)
- Free Whisper (local or free API tier)

---

## Key Cost Drivers

1. **Bandwidth egress** — Largest cost at scale (cloud providers charge for outbound data)
2. **Compute/CPU** — ffmpeg processing is CPU-intensive
3. **Whisper** — OpenAI API is ~50x more expensive than self-hosted, but at 2 min/video the difference is marginal

## Notes

- Ingress (uploads) is **free** on all major cloud providers
- Temp storage with immediate deletion has negligible cost
- Spot/preemptible instances can reduce compute costs by 60-70%
