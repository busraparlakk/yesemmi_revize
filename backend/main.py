import os
import io
import base64
import uuid
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

# ── Tensorflow / Keras ──────────────────────────────────────────────────────
import tensorflow as tf
import warnings
warnings.filterwarnings("ignore")

# ── App setup ──────────────────────────────────────────────────────────────
app = FastAPI(title="KaloriAI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Model yükleme ─────────────────────────────────────────────────────────
MODEL_PATH = Path(__file__).parent.parent / "kalori_modeli.keras"
model = None

@app.on_event("startup")
async def load_model():
    global model
    print(f"[KaloriAI] Model yükleniyor: {MODEL_PATH}")
    
    # Keras 3 quantization_config deserialization patch
    try:
        import keras
        orig_init = keras.layers.Dense.__init__
        def patched_init(self, *args, **kwargs):
            kwargs.pop('quantization_config', None)
            orig_init(self, *args, **kwargs)
        keras.layers.Dense.__init__ = patched_init
        print("[KaloriAI] Keras Dense deserialization yaması uygulandı.")
    except Exception as patch_err:
        print(f"[KaloriAI] Yama uygulanamadı (Keras import hatası olabilir): {patch_err}")

    try:
        model = tf.keras.models.load_model(str(MODEL_PATH))
        print("[KaloriAI] Model başarıyla yüklendi ✓")
    except Exception as e:
        print(f"[KaloriAI] Model yükleme hatası: {e}")
        # Uyarıları yoksay ve compile=False ile tekrar dene
        try:
            model = tf.keras.models.load_model(str(MODEL_PATH), compile=False)
            print("[KaloriAI] Model compile=False ile yüklendi ✓")
        except Exception as e2:
            print(f"[KaloriAI] İkinci deneme de başarısız: {e2}")

# ── Food-101 sınıf → kalori tablosu ──────────────────────────────────────
FOOD_CLASSES = [
    "apple_pie", "baby_back_ribs", "baklava", "beef_carpaccio", "beef_tartare",
    "beet_salad", "beignets", "bibimbap", "bread_pudding", "breakfast_burrito",
    "bruschetta", "caesar_salad", "cannoli", "caprese_salad", "carrot_cake",
    "ceviche", "cheesecake", "cheese_plate", "chicken_curry", "chicken_quesadilla",
    "chicken_wings", "chocolate_cake", "chocolate_mousse", "churros", "clam_chowder",
    "club_sandwich", "crab_cakes", "creme_brulee", "croque_madame", "cup_cakes",
    "deviled_eggs", "donuts", "dumplings", "edamame", "eggs_benedict",
    "escargots", "falafel", "filet_mignon", "fish_and_chips", "foie_gras",
    "french_fries", "french_onion_soup", "french_toast", "fried_calamari", "fried_rice",
    "frozen_yogurt", "garlic_bread", "gnocchi", "greek_salad", "grilled_cheese_sandwich",
    "grilled_salmon", "guacamole", "gyoza", "hamburger", "hot_and_sour_soup",
    "hot_dog", "huevos_rancheros", "hummus", "ice_cream", "lobster_bisque",
    "lobster_roll_sandwich", "macaroni_and_cheese", "macarons", "miso_soup", "mussels",
    "nachos", "omelette", "onion_rings", "oysters", "pad_thai",
    "paella", "pancakes", "panna_cotta", "peking_duck", "pho",
    "pizza", "pork_chop", "poutine", "prime_rib", "pulled_pork_sandwich",
    "ramen", "ravioli", "red_velvet_cake", "risotto", "samosa",
    "sashimi", "scallops", "seaweed_salad", "shrimp_and_grits", "spaghetti_bolognese",
    "spaghetti_carbonara", "spring_rolls", "steak", "strawberry_shortcake", "sushi",
    "tacos", "takoyaki", "tiramisu", "tuna_tartare", "waffles"
]

FOOD_CALORIES = {
    "apple_pie": 237, "baby_back_ribs": 320, "baklava": 395, "beef_carpaccio": 150,
    "beef_tartare": 190, "beet_salad": 95, "beignets": 320, "bibimbap": 490,
    "bread_pudding": 285, "breakfast_burrito": 370, "bruschetta": 180, "caesar_salad": 170,
    "cannoli": 250, "caprese_salad": 130, "carrot_cake": 415, "ceviche": 120,
    "cheesecake": 401, "cheese_plate": 340, "chicken_curry": 290, "chicken_quesadilla": 395,
    "chicken_wings": 430, "chocolate_cake": 352, "chocolate_mousse": 220, "churros": 310,
    "clam_chowder": 195, "club_sandwich": 590, "crab_cakes": 285, "creme_brulee": 450,
    "croque_madame": 520, "cup_cakes": 305, "deviled_eggs": 145, "donuts": 452,
    "dumplings": 320, "edamame": 120, "eggs_benedict": 365, "escargots": 175,
    "falafel": 333, "filet_mignon": 375, "fish_and_chips": 600, "foie_gras": 462,
    "french_fries": 365, "french_onion_soup": 245, "french_toast": 420, "fried_calamari": 280,
    "fried_rice": 445, "frozen_yogurt": 159, "garlic_bread": 350, "gnocchi": 245,
    "greek_salad": 180, "grilled_cheese_sandwich": 440, "grilled_salmon": 290,
    "guacamole": 150, "gyoza": 265, "hamburger": 540, "hot_and_sour_soup": 95,
    "hot_dog": 290, "huevos_rancheros": 395, "hummus": 165, "ice_cream": 207,
    "lobster_bisque": 230, "lobster_roll_sandwich": 435, "macaroni_and_cheese": 310,
    "macarons": 100, "miso_soup": 40, "mussels": 172, "nachos": 590, "omelette": 200,
    "onion_rings": 480, "oysters": 68, "pad_thai": 400, "paella": 380,
    "pancakes": 350, "panna_cotta": 180, "peking_duck": 340, "pho": 215, "pizza": 285,
    "pork_chop": 340, "poutine": 700, "prime_rib": 490, "pulled_pork_sandwich": 480,
    "ramen": 436, "ravioli": 220, "red_velvet_cake": 520, "risotto": 330,
    "samosa": 262, "sashimi": 130, "scallops": 111, "seaweed_salad": 70,
    "shrimp_and_grits": 380, "spaghetti_bolognese": 420, "spaghetti_carbonara": 490,
    "spring_rolls": 120, "steak": 679, "strawberry_shortcake": 290, "sushi": 350,
    "tacos": 210, "takoyaki": 198, "tiramisu": 615, "tuna_tartare": 175, "waffles": 291
}

FOOD_NAMES_TR = {
    "apple_pie": "Elmalı Turta", "baby_back_ribs": "Kaburga", "baklava": "Baklava",
    "beef_carpaccio": "Beef Carpaccio", "beef_tartare": "Beef Tartare", "beet_salad": "Pancar Salatası",
    "beignets": "Beignets", "bibimbap": "Bibimbap", "bread_pudding": "Ekmek Tatlısı",
    "breakfast_burrito": "Kahvaltı Burrito", "bruschetta": "Bruschetta", "caesar_salad": "Caesar Salata",
    "cannoli": "Cannoli", "caprese_salad": "Caprese Salata", "carrot_cake": "Havuçlu Kek",
    "ceviche": "Ceviche", "cheesecake": "Cheesecake", "cheese_plate": "Peynir Tabağı",
    "chicken_curry": "Tavuk Köri", "chicken_quesadilla": "Tavuklu Quesadilla",
    "chicken_wings": "Tavuk Kanadı", "chocolate_cake": "Çikolatalı Kek",
    "chocolate_mousse": "Çikolata Mousse", "churros": "Churros", "clam_chowder": "Midye Çorbası",
    "club_sandwich": "Kulüp Sandviç", "crab_cakes": "Yengeç Köftesi", "creme_brulee": "Crème Brûlée",
    "croque_madame": "Croque Madame", "cup_cakes": "Cupcake", "deviled_eggs": "Baharatlı Yumurta",
    "donuts": "Donut", "dumplings": "Mantı", "edamame": "Edamame",
    "eggs_benedict": "Eggs Benedict", "escargots": "Salyangoz", "falafel": "Falafel",
    "filet_mignon": "Fileto Mignon", "fish_and_chips": "Balık & Patates", "foie_gras": "Foie Gras",
    "french_fries": "Patates Kızartması", "french_onion_soup": "Fransız Soğan Çorbası",
    "french_toast": "Fransız Tostu", "fried_calamari": "Kızarmış Kalamar",
    "fried_rice": "Kızarmış Pilav", "frozen_yogurt": "Dondurulmuş Yoğurt",
    "garlic_bread": "Sarımsaklı Ekmek", "gnocchi": "Gnocchi", "greek_salad": "Yunan Salatası",
    "grilled_cheese_sandwich": "Peynirli Sandviç", "grilled_salmon": "Izgara Somon",
    "guacamole": "Guacamole", "gyoza": "Gyoza", "hamburger": "Hamburger",
    "hot_and_sour_soup": "Ekşi Acı Çorba", "hot_dog": "Hot Dog", "huevos_rancheros": "Huevos Rancheros",
    "hummus": "Humus", "ice_cream": "Dondurma", "lobster_bisque": "Istakoz Çorbası",
    "lobster_roll_sandwich": "Istakoz Sandviçi", "macaroni_and_cheese": "Makarna & Peynir",
    "macarons": "Makaron", "miso_soup": "Miso Çorbası", "mussels": "Midye",
    "nachos": "Nachos", "omelette": "Omlet", "onion_rings": "Soğan Halkası",
    "oysters": "İstiridye", "pad_thai": "Pad Thai", "paella": "Paella",
    "pancakes": "Pankek", "panna_cotta": "Panna Cotta", "peking_duck": "Pekin Ördeği",
    "pho": "Pho", "pizza": "Pizza", "pork_chop": "Domuz Pirzolası",
    "poutine": "Poutine", "prime_rib": "Prime Rib", "pulled_pork_sandwich": "Pulled Pork Sandviçi",
    "ramen": "Ramen", "ravioli": "Ravioli", "red_velvet_cake": "Red Velvet Kek",
    "risotto": "Risotto", "samosa": "Samosa", "sashimi": "Sashimi",
    "scallops": "Tarak", "seaweed_salad": "Deniz Yosunu Salatası", "shrimp_and_grits": "Karides & Grits",
    "spaghetti_bolognese": "Spagetti Bolonez", "spaghetti_carbonara": "Spagetti Carbonara",
    "spring_rolls": "Bahar Rulo", "steak": "Biftek", "strawberry_shortcake": "Çilekli Pasta",
    "sushi": "Sushi", "tacos": "Tacos", "takoyaki": "Takoyaki",
    "tiramisu": "Tiramisu", "tuna_tartare": "Ton Balığı Tartare", "waffles": "Waffle"
}

# ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((224, 224))
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)

# ── Endpoints ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "KaloriAI API çalışıyor 🍽️"}

@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model henüz yüklenmedi")

    try:
        contents = await file.read()
        img_array = preprocess_image(contents)

        predictions = model.predict(img_array, verbose=0)
        top_indices = np.argsort(predictions[0])[::-1][:3]

        top_results = []
        for idx in top_indices:
            class_name = FOOD_CLASSES[idx]
            confidence = float(predictions[0][idx])
            calories = FOOD_CALORIES.get(class_name, 250)
            name_tr = FOOD_NAMES_TR.get(class_name, class_name.replace("_", " ").title())
            top_results.append({
                "class": class_name,
                "name_tr": name_tr,
                "confidence": round(confidence * 100, 2),
                "calories_per_serving": calories
            })

        # Base64 thumbnail
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        img.thumbnail((400, 400))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        thumbnail_b64 = base64.b64encode(buf.getvalue()).decode()

        best = top_results[0]
        return {
            "success": True,
            "prediction": best["name_tr"],
            "class": best["class"],
            "confidence": best["confidence"],
            "calories": best["calories_per_serving"],
            "top3": top_results,
            "thumbnail": f"data:image/jpeg;base64,{thumbnail_b64}",
            "timestamp": datetime.now().isoformat(),
            "id": str(uuid.uuid4())
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tahmin hatası: {str(e)}")

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model is not None,
        "classes": len(FOOD_CLASSES)
    }
