# plenxAI Developer Documentation

This document contains the official API documentation for plenxAI, extracted and formatted for AI agents to read when integrating with the plenxAI API.

## 1. Authentication
All API requests require authentication using an `X-API-Key` header.
- **Header**: `X-API-Key: YOUR_API_KEY`

---

## 2. Image & Video Generation

### 2.1. Generate AI Image
- **Endpoint**: `POST /api/v1/developer/generate/image`
- **Description**: Tích hợp tạo ảnh AI vào ứng dụng của bạn.
- **Parameters**:
    - `prompt` (string, **Bắt buộc**): Mô tả văn bản nội dung mong muốn.
    - `model` (string, **Bắt buộc**): ID model đã chọn. (Ví dụ: `nano-banana-pro`, `nano-banana-full`, `nano-banana-2`, `kling-o1-image`, `image-gen-4`, `flux-2-pro`, `seedream-5-lite`, `seedream-4.5`, `grok-image`, `gpt-image-2`, `kling-3.0-omni-image`).
    - `resolution` (string, Tùy chọn): '1k', '2k', '4k'. (Mặc định: '1k').
    - `aspect_ratio` (string, Tùy chọn): 'Auto', '1:1', '4:3', '3:4', '9:16', '16:9'.
    - `references_urls` (string[], Tùy chọn): Danh sách URL ảnh tham khảo (tối đa 8).
    - `negative_prompt` (string, Tùy chọn): Những gì không muốn xuất hiện trong ảnh.
    - `server` (string, Tùy chọn): Server slug ('vip-01', 'business'). Ảnh hưởng routing và cost.
- **Response (200 OK)**:
    ```json
    { "success": true, "task_id": "abc123-def456-...", "status": "queued", "message": "Image generation queued successfully." }
    ```

### 2.2. Generate AI Video
- **Endpoint**: `POST /api/v1/developer/generate/video`
- **Description**: Tạo video AI (ví dụ sử dụng Veo 3 Fast, v.v.).

### 2.3. Motion Control
- **Endpoint**: `POST /api/v1/developer/generate/motion-control`
- **Description**: Kling Motion Control — chuyển động từ video tham chiếu sang ảnh nhân vật (v2.6 & v3.0).

### 2.4. Video Omni
- **Endpoint**: `POST /api/v1/developer/generate/video-omni`
- **Description**: Video Omni (ví dụ: Veo 3.1 Fast).

---

## 3. Status & Polling

### 3.1. Check Task Status
- **Endpoint**: `GET /api/v1/developer/status/{task_id}`
- **Description**: Poll trạng thái generation. Trả về `result_url` khi hoàn thành.
- **Response (200 OK)**:
    ```json
    {
      "success": true,
      "status": "completed", // Hoặc "pending", "processing", "failed", "queued"
      "url": "https://url-anh-hoac-video-ket-qua",
      "error": null
    }
    ```

---

## 4. Text Generation API

### 4.1. Generate Text
- **Endpoint**: `POST /api/v1/developer/text-gen/generate`
- **Description**: Generate text bằng AI. Hỗ trợ multi-modal (text + images).

### 4.2. List Models
- **Endpoint**: `GET /api/v1/developer/text-gen/models`
- **Description**: Liệt kê các model text generation khả dụng.

---

## 5. Voice TTS API (Mới)

### 5.1. Generate Voice
- **Endpoint**: `POST /api/v1/developer/generate/voice`
- **Description**: Tạo giọng nói AI từ text (Text-to-Speech).

### 5.2. List Voice Models
- **Endpoint**: `GET /api/v1/developer/voice/models`
- **Description**: Liệt kê các TTS models khả dụng.

### 5.3. List Voices
- **Endpoint**: `GET /api/v1/developer/voice/voices`
- **Description**: Liệt kê giọng nói có sẵn từ thư viện.

---

## 6. Media Upload API
*Dùng để upload ảnh tham khảo hoặc video đầu vào cho các task generation.*

### 6.1. Presign Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/presign`
- **Description**: Tạo presigned URL để upload trực tiếp lên Cloudflare R2.

### 6.2. Confirm Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/confirm`
- **Description**: Xác nhận upload & push image lên Cloudflare Images CDN.

### 6.3. Direct Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/direct`
- **Description**: Upload server-side (base64) cho file nhỏ.

### 6.4. Delete Media
- **Endpoint**: `DELETE /api/v1/developer/media-upload/{media_id}`
- **Description**: Xóa media đã upload (R2 + DB).

---

## 7. Remove Background API (Mới)

### 7.1. Remove Background
- **Endpoint**: `POST /api/v1/developer/remove-background`
- **Description**: Xóa nền ảnh (đồng bộ). Trả về URL ảnh đã xóa nền ngay lập tức.

### 7.2. Remove Background Batch
- **Endpoint**: `POST /api/v1/developer/remove-background/batch`
- **Description**: Xóa nền nhiều ảnh cùng lúc (tối đa 10). Xử lý đồng thời, trả về tất cả kết quả.

---

## 8. Error Handling
Khi request thất bại, API sẽ trả về cấu trúc lỗi chi tiết.
```json
{
  "success": false,
  "error": "Mã lỗi",
  "message": "Mô tả chi tiết lỗi"
}
```
