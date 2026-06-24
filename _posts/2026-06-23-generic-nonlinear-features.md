---
layout: post
title: "Generic Non-linear Features: ฟีเจอร์ไม่เชิงเส้นแบบทั่วไป"
date: 2026-06-23 02:00:00 +0700
page_css: /assets/css/deep-learning-notes.css
categories:
    - notes
permalink: /notes/:year/:month/:day/:title/
---

> Note นี้ขยายหัวข้อ **generic non-linear features** จากบทความ [Deep Learning (LeCun, Bengio & Hinton — Nature 2015)]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) โดยเฉพาะส่วนที่กล่าวถึงข้อจำกัดของ [linear classifier](#) และทางออกก่อนที่ deep learning จะเข้ามาแก้ปัญหา

---

## ทำไมต้องมี Non-linear Features?

### ปัญหาของ Linear Classifier

[**Linear classifier**]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) แบ่งปริภูมิอินพุตได้เพียง **ครึ่งปริภูมิ (half-spaces)** ที่คั่นด้วย **ไฮเปอร์เพลน (hyperplane)** ซึ่งไม่เพียงพอสำหรับข้อมูลในโลกจริง

<div class="exam-box">
  <div class="exam-box__title">★ ตัวอย่างที่ Linear Classifier ล้มเหลว</div>
  <ul>
    <li>ข้อมูลสองคลาสที่จัดเรียงเป็น <b>วงกลมซ้อนกัน</b> (concentric circles) — ไม่มีเส้นตรงใดแบ่งได้</li>
    <li>ข้อมูล XOR — สี่จุดที่สลับสีกัน ไม่มี hyperplane แบ่งถูก</li>
    <li>ภาพที่มีวัตถุเดียวกันแต่ท่าทาง / แสง / พื้นหลังต่างกัน → ระดับพิกเซลไม่เชิงเส้นเลย</li>
  </ul>
</div>

ปัญหานี้เรียกว่า [**selectivity–invariance dilemma**]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) จาก DL note: ต้องการ classifier ที่ **ไวต่อความแตกต่างสำคัญ** แต่ **ทนทานต่อความแปรผันที่ไม่เกี่ยวข้อง** พร้อมกัน — สิ่งที่ linear classifier ไม่สามารถทำได้

---

## Generic Non-linear Features คืออะไร?

แนวคิดหลัก: **แปลงข้อมูลจากปริภูมิเดิมไปสู่ปริภูมิใหม่** ที่ข้อมูลแยกได้เชิงเส้น แล้วค่อยใช้ linear classifier ในปริภูมิใหม่นั้น

```
ข้อมูลดิบ x  →  [φ(x) : feature mapping]  →  ปริภูมิใหม่  →  Linear Classifier
```

| แนวทาง | รายละเอียด |
|---|---|
| **Hand-crafted features** | วิศวกรออกแบบ φ เอง (SIFT, HOG, MFCC) — ต้องใช้ domain expertise สูง |
| **Generic non-linear features** | ใช้ฟังก์ชันทั่วไปอย่าง kernel เพื่อแมปอัตโนมัติ — ไม่ต้อง design เอง |
| **Learned features (deep learning)** | เครื่องเรียนรู้ [feature extractor]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) โดยอัตโนมัติจากข้อมูล |

---

## Kernel Methods — ตัวแทนหลักของ Generic Non-linear Features

**Kernel method** (เช่น SVM ด้วย RBF kernel) คือวิธีที่นิยมมากที่สุด สำหรับ generic non-linear features

### หลักการ

แทนที่จะแมป x → φ(x) ตรง ๆ (ซึ่งปริภูมิอาจมีมิติสูงมากหรืออนันต์) ใช้ **kernel function** ที่คำนวณ "ความคล้าย" ระหว่างสองจุดในปริภูมิใหม่โดยตรง:

```
k(x, x') = φ(x)ᵀ φ(x')
```

### Gaussian (RBF) Kernel

kernel ที่พบบ่อยที่สุด:

```
k(x, x') = exp(−‖x − x'‖² / 2σ²)
```

- ค่าใกล้ 1 เมื่อสองจุดอยู่ใกล้กัน
- ค่าใกล้ 0 เมื่ออยู่ห่างกัน
- φ(x) ที่ implicit อยู่นั้นมีมิติอนันต์ — แต่คำนวณ kernel ได้ใน O(d) เสมอ

### ข้อดีของ Kernel Methods

- ไม่ต้อง design feature extractor เอง
- รับประกัน global optimum (convex optimization)
- ทฤษฎีพิสูจน์ได้ (PAC learning, VC dimension)

---

## ข้อจำกัดสำคัญ

<div class="exam-box">
  <div class="exam-box__title">★ จุดอ่อนของ Generic Non-linear Features</div>
  ตามที่ระบุใน <a href="{{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}">DL note (LeCun et al. 2015)</a>:<br><br>
  <blockquote>
    "คุณลักษณะทั่วไปเหล่านี้ <b>ไม่ช่วยให้วางนัยทั่วไปได้ดีในจุดที่ไกลจากตัวอย่างฝึก</b>"
  </blockquote>
  กล่าวคือ kernel method <b>interpolate ได้ดี แต่ extrapolate ได้แย่</b>
</div>

### สาเหตุ

1. **Curse of dimensionality** — ใน input space มิติสูง จุดทุกจุดอยู่ "ห่าง" กันเสมอ ทำให้ Gaussian kernel ลดลงเร็วมาก
2. **ต้องเก็บ support vectors** — ความซับซ้อนของ model ผูกกับจำนวน training examples ไม่ใช่โครงสร้างที่แท้จริงของข้อมูล
3. **ไม่มีการแชร์ representation** — แต่ละ kernel คำนวณความคล้ายกับ training points โดยตรง ไม่มีการ "เข้าใจ" โครงสร้างลำดับชั้น

### เปรียบเทียบ

| คุณสมบัติ | Generic Non-linear (Kernel) | Deep Learning |
|---|---|---|
| Feature design | อัตโนมัติ (kernel เลือก) | เรียนรู้จากข้อมูล |
| Scalability | O(n²) ถึง O(n³) | O(n) ต่อ epoch |
| Extrapolation | แย่ | ดี (ถ้าฝึกดี) |
| Interpretability | ปานกลาง | ต่ำ |
| Theoretical guarantee | สูง | น้อย |
| Feature hierarchy | ไม่มี | มี (หลายชั้น) |

---

## Deep Learning แก้ปัญหาอย่างไร

แทนที่จะใช้ generic feature mapping φ ที่ไม่รู้จักข้อมูล deep learning เรียนรู้ **ลำดับชั้นของ non-linear transformations** จากข้อมูลโดยตรง ผ่าน [backpropagation]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}):

```
x → [layer 1: φ₁] → [layer 2: φ₂] → … → [layer L: φ_L] → linear classifier
```

แต่ละ layer เป็น non-linear transformation แบบ:

```
h = f(Wx + b)   โดย f คือ activation function เช่น ReLU
```

[**ReLU**]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) `f(z) = max(0, z)` เป็น activation function ที่นิยมที่สุด เพราะ:
- คำนวณเร็ว
- gradient ไม่หายไป (ต่างจาก sigmoid/tanh ในเครือข่ายลึก)
- ทำให้ deep network ฝึกได้โดยไม่ต้อง pre-train

<div class="exam-box">
  <div class="exam-box__title">★ Key Insight จาก LeCun et al. 2015</div>
  ชั้นซ่อน (hidden layers) ใน deep network ทำหน้าที่เหมือน <b>บิดเบือนอินพุตแบบไม่เชิงเส้น</b> เพื่อให้หมวดต่าง ๆ <b>แยกได้เชิงเส้น (linearly separable)</b> ด้วยชั้นสุดท้าย — นี่คือเหตุผลที่ deep learning ชนะ generic kernel methods ในงานสเกลใหญ่
</div>

---

## Visualization แบบ Interactive: z = x² + y²

ตัวอย่างต่อไปนี้แสดงการแปลงข้อมูล 2 มิติ (concentric circles) สู่ 3 มิติด้วยฟังก์ชัน **z = x² + y²** ซึ่งเป็น non-linear feature mapping อย่างง่าย — หลังแปลง ข้อมูลที่เคยแยกไม่ออก สามารถแบ่งได้ด้วย hyperplane เดียว

<div style="border-radius: 12px; overflow: hidden; margin: 2rem 0; box-shadow: 0 4px 24px rgba(0,0,0,0.18);">
  <iframe
    src="{{ '/assets/nonlinear-vis.html' | relative_url }}"
    width="100%"
    height="520"
    style="border: none; display: block;"
    title="Non-linear Feature Visualization: z = x² + y²"
    loading="lazy"
  ></iframe>
</div>

**วิธีใช้:**
1. **เลื่อนสไลเดอร์** — ยกข้อมูลขึ้นตามฟังก์ชัน z = x² + y² (แกน Z)
2. **กด "แทรกระนาบ"** — เพิ่ม hyperplane สีเขียวเพื่อดูว่าแบ่ง 2 คลาสได้หลังยกมิติ
3. **ลาก / ซูม** — หมุน scene ด้วยเมาส์หรือ touch

---

## สรุปศัพท์ที่เชื่อมกับ Deep Learning Note

| ศัพท์ | บทบาทใน Generic Non-linear Features | ใน DL Note |
|---|---|---|
| **Linear classifier** | สิ่งที่ต้องการใช้ในปริภูมิใหม่ | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **Hyperplane** | ขอบเขตการตัดสินใจใน feature space | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **Feature extractor** | φ(x) ใน kernel method / ชั้น neural network | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **Representation learning** | deep learning เรียนรู้ φ อัตโนมัติ | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **ReLU** | non-linear activation ที่ทำให้ deep network ฝึกได้ | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **Backpropagation** | วิธีเรียนรู้พารามิเตอร์ของ non-linear layers | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |
| **Selectivity–Invariance** | ปัญหาที่ generic features ยังแก้ไม่สมบูรณ์ | [อ่านเพิ่มเติม]({{ '/notes/2026/06/23/deep-learning-notes/' | relative_url }}) |

---

*อ้างอิง: LeCun, Y., Bengio, Y. & Hinton, G. "Deep learning." Nature 521, 436–444 (2015). Schölkopf, B. & Smola, A. "Learning with Kernels" (2002).*
