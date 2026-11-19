#!/usr/bin/env python3
"""
Link an EU/EEA bank account to your own Enable Banking application (free "restricted"
mode: your own accounts only) and print the EB_ACCOUNTS JSON for bank_sync.gs.

  pip install requests pyjwt cryptography
  python link.py --app-id <APP_ID> --key path/to/private.pem --redirect https://example.com/callback \
                 --country DE --bank "N26" [--days 180]

Steps it walks you through:
  1. finds the bank (ASPSP) by name in the country
  2. prints a consent URL: open it, log in to your bank, approve
  3. you paste back the URL you were redirected to (the page itself may 404; that's fine)
  4. it creates the session and prints the account uids + consent expiry

Your private key never leaves your machine. Do not paste it into chats with AI agents.
"""
import argparse, json, time, uuid, datetime as dt
from urllib.parse import urlparse, parse_qs
import jwt, requests

API = "https://api.enablebanking.com"

def token(app_id, key):
    now = int(time.time())
    return jwt.encode({"iss": "enablebanking.com", "aud": "api.enablebanking.com", "iat": now, "exp": now + 3600},
                      key, algorithm="RS256", headers={"kid": app_id})

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--app-id", required=True); p.add_argument("--key", required=True)
    p.add_argument("--redirect", required=True); p.add_argument("--country", required=True)
    p.add_argument("--bank", required=True); p.add_argument("--days", type=int, default=180)
    a = p.parse_args()
    h = {"Authorization": "Bearer " + token(a.app_id, open(a.key).read())}
    banks = requests.get(f"{API}/aspsps", params={"country": a.country, "psu_type": "personal"}, headers=h, timeout=60).json()["aspsps"]
    match = [b for b in banks if a.bank.lower() in b["name"].lower()]
    if not match:
        raise SystemExit("No match. Available: " + ", ".join(sorted(b["name"] for b in banks)))
    bank = match[0]
    days = min(a.days, bank.get("maximum_consent_validity", a.days * 86400) // 86400 or a.days)
    valid_until = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)).isoformat()
    r = requests.post(f"{API}/auth", headers=h, timeout=60, json={
        "access": {"valid_until": valid_until}, "aspsp": {"name": bank["name"], "country": bank["country"]},
        "state": str(uuid.uuid4()), "redirect_url": a.redirect, "psu_type": "personal"}).json()
    print("\nOpen this URL, log in to your bank and approve:\n\n" + r["url"] + "\n")
    code = parse_qs(urlparse(input("Paste the full URL you were redirected to: ").strip()).query).get("code", [None])[0]
    if not code:
        raise SystemExit("No ?code= in that URL.")
    s = requests.post(f"{API}/sessions", headers=h, json={"code": code}, timeout=60).json()
    until = s.get("access", {}).get("valid_until", valid_until)[:10]
    out = [{"name": f"{bank['name']} {acc.get('currency', '')}".strip(), "uid": acc["uid"],
            "currency": acc.get("currency", ""), "validUntil": until} for acc in s.get("accounts", [])]
    print("\nAdd these to the EB_ACCOUNTS script property (merge with any existing list):\n")
    print(json.dumps(out, indent=2))

if __name__ == "__main__":
    main()
