# TRACE // Spatiotemporal Lost-Item & Pet Radiance Recovery Engine

**TRACE** คือระบบโครงข่ายพิกัดกู้คืนของหายและจำลองรัศมีสัตว์เลี้ยงด้วย AI (Civic-Tech Spatial Intelligence & Multimodal Verification Platform) ที่ผสานการคำนวณความน่าจะเป็นเชิงเวลา-พื้นที่ (Spatiotemporal IMU Drop Probability), แบบจำลองการแพร่กระจายของสัตว์เลี้ยง (2D Cellular Automata), ฐานข้อมูลภูมิสารสนเทศ **PostGIS (`SRID 4326`)**, และระบบพิสูจน์ความเป็นเจ้าของด้วย **Gemini 2.5 Flash Vision AI**

---

## 1. Core Architectural Pillars (4 เสาหลักของระบบ)

### 1.1 Spatiotemporal IMU Drop Probability & Ghost Vector Detection
คำนวณความน่าจะเป็นของการทำสิ่งของตกหล่น $P_{\text{drop}}(p_i) \in [0, 1]$ บนเส้นทางของผู้ใช้จากข้อมูลพิกัดและเซนเซอร์ความเฉื่อย (Accelerometer / Gyroscope):
- **Micro-Dwell ($D_i$):** จังหวะหยุดนิ่งชั่วขณะ เช่น ก้มผูกเชือกรองเท้า หรือแวะวางของที่ม้านั่ง
- **Kinematic Jerk ($J_i$):** แรงกระตุกฉับพลันของความเร่งเชิงเส้นและอัตราการหมุน
- **Transit Egress & Ghost Vector ($T_i$):** การเปลี่ยนถ่ายความเร็วขณะก้าวลงจากยานพาหนะ พร้อมตรวจจับ **Ghost Vector** (กรณีลืมของไว้บนรถที่กำลังเคลื่อนที่ต่อไปข้างหน้า)

### 1.2 Biometric Pet Radiance Engine (2D Cellular Automata)
จำลองการเคลื่อนที่ของสัตว์เลี้ยงพลัดหลงตามโปรไฟล์พฤติกรรม (`SHY_CAT`, `SPOOKED_DOG`, `CURIOUS_DOG`) สภาพภูมิประเทศจริง และสภาพอากาศ (ฝนตก/ฟ้าร้องเพิ่มแรงดึงดูดเข้าหาพื้นที่หลบภัย 2 เท่า) พร้อมระบบบีบวงรัศมีแบบเบย์เซียนเมื่อมีผู้แจ้งเบาะแสจุดพบเห็นล่าสุด

### 1.3 Zero-Knowledge Gemini Vision AI Vault & 2D Bounding-Box Redaction
ป้องกันการแอบอ้างสิทธิ์ (Anti-Fraud Claim Verification):
- สกัดเฉพาะข้อมูลทั่วไป (`Public Macro Tags`) สำหรับแสดงผลสาธารณะ
- ใช้ **Gemini 2.5 Flash** ตรวจจับพิกัดกรอบสี่เหลี่ยม (`[ymin, xmin, ymax, xmax]`) เพื่อเบลอตำหนิลับและข้อมูลส่วนบุคคลบน HTML5 Canvas อัตโนมัติ
- สร้างคำถามท้าทาย 2 ภาษา (TH/EN) และตรวจคำตอบเชิงความหมาย (Semantic Grading) ก่อนปลดล็อกภาพจริงและแนะนำจุดนัดรับปลอดภัยที่มีกล้อง CCTV (**Samaritan Shield**)

### 1.4 Pre-Loss Samaritan Shield QR Generator
สร้างภาพหน้าจอล็อกมือถือ (Lockscreen Wallpaper) และป้ายสติกเกอร์ติดสิ่งของที่ฝังพิกัด `SRID 4326` และรางวัลนำส่งคืน (Bounty) ให้ผู้พบของสแกนแจ้งพิกัดได้ทันทีผ่านเว็บเบราว์เซอร์โดยไม่ต้องติดตั้งแอปพลิเคชัน

---

## 5. UX Architecture & Behavioral Ecosystem (Showcase Extensions)

### 5.1 Community Scout XP & Cold-Start Mitigation (Gamified Crowdsensing)
เพื่อแก้ปัญหา Cold-Start ในช่วงเริ่มต้นที่มีผู้ใช้งานในพื้นที่จำกัด TRACE ใช้ระบบ **Community Scout XP**:
- **Negative-Confirmation Micro-Quests:** เมื่อผู้ใช้งานเดินผ่านพื้นที่จุดเสี่ยงสีแดง (High-Probability Drop Zones) ระบบจะสร้างภารกิจย่อยให้ช่วยกดยืนยันผลการสำรวจ เช่น *"สำรวจม้านั่งและทางเท้าในรัศมี 15 เมตรแล้ว ไม่พบสิ่งของ (+50 XP)"* หรือ *"อัปเดตเบาะแสสัตว์เลี้ยง (+100 XP)"*
- **Probability Decay Update:** เมื่อมีอาสาสมัครกดยืนยันว่าไม่พบของที่จุด $p_i$ ระบบจะลดทอนค่าน้ำหนักความน่าจะเป็นของจุดนั้นลง และปรับลำดับความสำคัญไปยังจุดถัดไปแบบ Real-time
- **Campus Reward Redemption:** แต้ม XP ที่สะสมสามารถนำไปแลกสิทธิพิเศษหรือส่วนลดร้านค้าพาร์ทเนอร์ในรัศมีมหาวิทยาลัยและระบบขนส่งมวลชน

### 5.2 Hackathon Judge Role Switcher (Zero-Auth Multi-Persona Bar)
แถบสลับบทบาทแบบ 1-Click สำหรับคณะกรรมการและผู้ทดสอบระบบ ช่วยให้ตรวจสอบการทำงานแบบ Asymmetric Flow ได้ทันทีโดยไม่ต้องสลับบัญชีผู้ใช้:
1. **Loser View (ผู้ทำของหาย):** วิเคราะห์กราฟเซนเซอร์ IMU, จุดเสี่ยง Ghost Vector และสแกนเรดาร์ PostGIS 30m
2. **Pet Radiance View (ผู้ตามหาสัตว์เลี้ยง):** จำลองการเคลื่อนที่ด้วย 2D Cellular Automata ตามสภาพอากาศและภูมิประเทศ
3. **Finder & AI Vault View (ผู้เก็บของได้และระบบยืนยันตัวตน):** ทดสอบอัปโหลดภาพเพื่อให้ Gemini Vision AI เบลอข้อมูลสำคัญ (2D Bounding-Box Redaction) และตั้งคำถามท้าทาย 2 ภาษาอัตโนมัติ
4. **QR Shield Generator (ระบบป้องกันล่วงหน้า):** สร้างภาพพักหน้าจอล็อกสกรีนและป้าย Tag ผูกพิกัด

### 5.3 Lumi-Style Recovery Probability Score (0–100 Visual Gauge)
แปลงผลลัพธ์จากสมการความน่าจะเป็นเชิงพื้นที่ $P_{\text{drop}}(p_i) \in [0, 1]$ และระยะห่างจากฐานข้อมูล PostGIS ให้เป็นมาตรวัดวงกลม **Recovery Probability Score (0–100)** พร้อมคำแนะนำลำดับการค้นหาที่เข้าใจได้ทันทีสำหรับผู้ใช้ทั่วไป

---

## Getting Started

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` เพื่อใช้งานระบบ
