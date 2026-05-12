import cv2
import numpy as np
import os

input_path = "cat_anime/bow.png"
output_dir = "frames_final"

os.makedirs(output_dir, exist_ok=True)

# 读取图片
img = cv2.imread(input_path)
if img is None:
    raise ValueError("图片路径错误")

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# ✅ 1. 二值化（稍微放宽，保证猫完整）
_, thresh = cv2.threshold(gray, 235, 255, cv2.THRESH_BINARY_INV)

# ✅ 2. 关键：腐蚀，强制断开粘连
kernel = np.ones((5, 5), np.uint8)
thresh = cv2.erode(thresh, kernel, iterations=2)

# （可选）轻微恢复形状
thresh = cv2.dilate(thresh, kernel, iterations=1)

# ✅ 3. 找轮廓
contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

boxes = []

# ✅ 4. 过滤合理区域
for cnt in contours:
    x, y, w, h = cv2.boundingRect(cnt)
    area = w * h

    # 过滤太小噪声
    if area < 20000:
        continue

    boxes.append((x, y, w, h))

# ✅ 5. 排序（从上到下，从左到右）
boxes = sorted(boxes, key=lambda b: (b[1] // 100, b[0]))

print(f"检测到 {len(boxes)} 个目标")

# ✅ 6. 裁剪 + 精细去边
for i, (x, y, w, h) in enumerate(boxes, 1):
    sub = img[y:y+h, x:x+w]

    # 再做一次精细去白边
    gray_sub = cv2.cvtColor(sub, cv2.COLOR_BGR2GRAY)
    _, th = cv2.threshold(gray_sub, 240, 255, cv2.THRESH_BINARY_INV)

    coords = cv2.findNonZero(th)
    if coords is not None:
        x2, y2, w2, h2 = cv2.boundingRect(coords)
        sub = sub[y2:y2+h2, x2:x2+w2]

    out_path = os.path.join(output_dir, f"{i:02d}.png")
    cv2.imwrite(out_path, sub)

    print("Saved:", out_path)

print("✅ 完成")