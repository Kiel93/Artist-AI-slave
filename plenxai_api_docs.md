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
    - `model` (string, **Bắt buộc**): ID model đã chọn. (Ví dụ: `nano-banana-pro`, `kling-o1-image`, `flux-2-pro`, `grok-image`, `gpt-image-2`).
    - `resolution` (string, Tùy chọn): '1k', '2k', '4k'. (Mặc định: '1k').
    - `aspect_ratio` (string, Tùy chọn): 'Auto', '1:1', '4:3', '3:4', '9:16', '16:9'.
    - `references_urls` (string[], Tùy chọn): Danh sách URL ảnh tham khảo (tối đa 8).
    - `negative_prompt` (string, Tùy chọn): Những gì không muốn xuất hiện trong ảnh.
- **Response (200 OK)**:
    ```json
    { "success": true, "task_id": "uuid-của-task", "message": "Task queued" }
    ```

### 2.2. Generate AI Video
- **Endpoint**: `POST /api/v1/developer/generate/video`
- **Description**: Tạo video AI từ văn bản hoặc hình ảnh.
- **Models**: `veo-3-fast`, `veo-3-relaxed`, `veo-3-quality`, `kling-2.6`, `kling-3.0-pro`, `grok-video`.

### 2.3. Motion Control
- **Endpoint**: `POST /api/v1/developer/generate/motion-control`
- **Description**: Video generation với khả năng điều khiển chuyển động nâng cao.

### 2.4. Video Omni
- **Endpoint**: `POST /api/v1/developer/generate/video-omni`
- **Description**: Sử dụng model Omni (ví dụ: `kling-3.0-omni`) để tạo video chất lượng cao nhất.

---

## 3. Status & Polling

### 3.1. Check Task Status
- **Endpoint**: `GET /api/v1/developer/status/{task_id}`
- **Description**: Kiểm tra trạng thái của task (Image/Video).
- **Response (200 OK)**:
    ```json
    {
      "success": true,
      "status": "completed", // Hoặc "pending", "processing", "failed"
      "url": "https://url-anh-hoac-video-ket-qua",
      "error": null
    }
    ```

---

## 4. Text Generation API

### 4.1. Generate Text
- **Endpoint**: `POST /api/v1/developer/text-gen/generate`
- **Description**: Gọi các model ngôn ngữ (LLMs) như GPT-4, Claude 3, v.v.

### 4.2. List Models
- **Endpoint**: `GET /api/v1/developer/text-gen/models`

---

## 5. Media Upload API
*Dùng để upload ảnh tham khảo hoặc video đầu vào cho các task generation.*

### 5.1. Presign Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/presign`
- **Parameters**: `filename`, `content_type`.
- **Description**: Lấy URL tạm thời để upload file lên Cloudflare R2.

### 5.2. Confirm Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/confirm`
- **Parameters**: `key`, `filename`, `content_type`, `bytes`.
- **Description**: Xác nhận file đã upload thành công để hệ thống lưu vào DB.

### 5.3. Direct Upload
- **Endpoint**: `POST /api/v1/developer/media-upload/direct`
- **Description**: Upload trực tiếp file từ client (Multipart form-data). Trả về URL cuối cùng.

### 5.4. Delete Media
- **Endpoint**: `DELETE /api/v1/developer/media-upload/{media_id}`

---

## 6. Error Handling
Khi request thất bại, API sẽ trả về lỗi theo cấu trúc:
```json
{
  "success": false,
  "error": "Mã lỗi",
  "message": "Mô tả chi tiết lỗi (ví dụ: Invalid model, Insufficient balance)"
}
```
