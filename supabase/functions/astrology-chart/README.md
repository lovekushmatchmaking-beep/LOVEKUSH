# astrology-chart (kundli API integration point)

Guna Milan already works without any API: members who know their Rashi and
Nakshatra pick them in signup or Edit Profile, and `src/utils/astrology.js`
scores all 8 koots (36 gun). This function is only for members who don't know
them: it computes Rashi / Nakshatra / Pada from birth date + time + place.

## To switch it on

1. Choose a vendor whose API returns the **sidereal (Lahiri) Moon sign and
   nakshatra + pada** for a birth date, time and location.
2. Fill `callVendor()` in `index.ts`: call the vendor, then return
   `rashiIndex` (0 = Mesha … 11 = Meena), `nakshatraIndex` (0 = Ashwini … 26 =
   Revati), `pada` (1–4), optional `manglik`, and the raw response.
   Geocode `place` first if the vendor needs latitude/longitude/timezone.
3. Store the key as a Supabase secret (never in the React app):
   `supabase secrets set ASTROLOGY_API_KEY=...`
4. Deploy: `supabase functions deploy astrology-chart`
5. In Vercel, set `REACT_APP_ASTROLOGY_API_ENABLED=true` and redeploy. This
   shows a "Calculate from birth details" button in Edit Profile → Horoscope.

Values the API writes are stored with `profiles.astro_source = 'api'`, and the
raw vendor response is stored in `profiles.astro_api_payload`.
