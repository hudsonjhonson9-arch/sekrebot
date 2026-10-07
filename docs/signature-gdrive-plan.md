# Signature Save to Google Drive Plan

## Current State
- Frontend sends base64 signature to `/webhook/signature-save`
- n8n saves base64 directly to `tanda_tangan.signature` column
- Database already has Google Drive URLs (from previous migration)
- But new saves will overwrite with base64 again

## Goal
Upload signature to Google Drive before saving, store URL instead of base64.

## Approach: n8n Google Drive Upload

### Prerequisites
1. Google Cloud project with Drive API enabled
2. Service account with folder access
3. Shared folder for signatures

### Workflow Changes

#### 1. New Workflow: `google-drive-upload`
```
Webhook (POST /webhook/google-drive-upload)
  ↓
HTTP Request (Google Drive API - upload file)
  ↓
Respond with URL
```

#### 2. Updated Workflow: `signature-save`
```
Signature Save Webhook
  ↓
CORS Handler
  ↓
Google Drive Upload (call new workflow)
  ↓
INSERT/UPDATE with URL
  ↓
Respond
```

### Implementation Steps

#### Step 1: Create Google Drive Upload Workflow

**File:** `n8n/google-drive-upload.workflow.json`

**Nodes:**
1. Webhook - POST `/webhook/google-drive-upload`
2. Code - Parse base64, convert to blob
3. HTTP Request - Upload to Google Drive API
4. Code - Extract file ID, build URL
5. Respond - Return URL

**HTTP Request Config:**
```json
{
  "method": "POST",
  "url": "https://www.googleapis.com/upload/drive/v3/files",
  "authentication": "oAuth2",
  "sendBody": true,
  "contentType": "multipart-form-data",
  "bodyParameters": {
    "parameters": [
      { "name": "uploadType", "value": "multipart" }
    ]
  }
}
```

#### Step 2: Update Signature Save Workflow

**Current Query:**
```sql
INSERT INTO "tanda_tangan" ("nip", "signature", "saved_at", "saved_by")
VALUES ('{{ $json.nip }}', '{{ ($json.signature)... }}', ...)
```

**Updated Flow:**
1. Call Google Drive Upload workflow
2. Get URL from response
3. Use URL in INSERT query

**New Query:**
```sql
INSERT INTO "tanda_tangan" ("nip", "signature", "saved_at", "saved_by")
VALUES ('{{ $json.nip }}', '{{ $json.drive_url }}', ...)
```

#### Step 3: Test

1. Save signature via frontend
2. Verify uploaded to Google Drive
3. Verify URL saved to database
4. Verify signature displays correctly

### Alternative: Simpler Approach

If Google Drive API setup is complex, consider:

**Option A: Use existing signature-save but compress more**
- Already compressing to 600px, 0.6 quality
- Could reduce further but quality degrades

**Option B: Use Supabase Storage**
- If already using Supabase for other storage
- Simpler API, no Google Cloud setup needed

**Option C: Use free image hosting (imgbb)**
- Simple API, no auth needed
- But less control, rate limits

### Recommendation

Start with **Google Drive approach** since:
- Signatures already stored as Google Drive URLs
- User likely has Google account
- Free, reliable, good quality

Set up:
1. Create Google Cloud project
2. Enable Drive API
3. Create service account
4. Create shared folder for signatures
5. Import n8n workflow
6. Update signature-save workflow

---

## Next Steps

1. Confirm Google account access
2. Set up Google Cloud project (if not done)
3. Create n8n workflow
4. Test locally
5. Deploy to production

Want me to proceed with creating the n8n workflow?
