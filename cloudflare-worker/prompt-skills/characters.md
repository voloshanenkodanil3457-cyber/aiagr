# Персонажи: формула «живого человека» (анти-AI-пластик)

Проблема: персонажи выглядят «по-нейросетевому» или как близнецы. Решение — официальная формула персонажа (работает и для реалистичных людей, и для анимационных персонажей):

```
Персонаж = [Возраст/Этнос] + [Тон/Текстура кожи] + [Детали лица] + [Глаза/«Душа»] +
[Причёска/Цвет волос] + [Одежда/Фактура ткани] + [Телосложение/Эмоция/Темперамент] + [Прочее (опц.)]
```

## Разбор каждого блока (с под-формулами и примерами)

### 1. [Возраст/Этнос] — тон персонажа
Под-формула: [конкретный возраст] + [национальность/этнос] + [стилевое прилагательное] + [тип лица].
- «22-year-old East Asian woman with a cold and classical bone-like face»
- «25-year-old British male, with a thin and intelligent aristocratic face»
- «26-year-old African-American woman with an extremely three-dimensional supermodel face»

### 2. [Тон/Текстура кожи] — против «плоской белизны»
Под-формула: [тёплый/холодный тон] + [конкретное название тона] + [прилагательное текстуры] + **обязательный суффикс реализма: «retaining the true micro pores and skin texture»** (можно добавить веснушки/несовершенства).
- «Cold-toned fair skin with a delicate, moist jade-like texture, retaining true micro-pores and skin texture»
- «Warm honey skin with a sunlit glow, faint real freckles on the nose bridge, preserving fine pores»
- «Rough wheat-colored skin with weathered fine lines, true large pores, stubble marks»

### 3. [Детали лица] — узнаваемость
Под-формула: [форма глаз] + [брови/надбровья] + [нос] + [губы] + [линия челюсти/кости]. **Минимум 3–4 пункта в связке.**
- «Slender peach-blossom eyes (slightly moist), small straight nose bridge, plump lips with a faint smile, soft jawline»

### 4. [Глаза/«Душа»] — эмоция
Под-формула: [прилагательное глаз] + [что передаёт взгляд/метафора] + [скрытая эмоция].
- «Gaze gentle and focused, like a pool of spring water, revealing deep attachment and a hint of reluctance»
- «Eyes calm and empty like a bottomless black hole; sharp, oppressive gaze with elusive danger»

### 5. [Причёска/Цвет волос] — против «монотонного чёрного»
Под-формула: [конкретный цвет] + [состояние/текстура волос] + [конкретное название причёски] + [взаимодействие со средой (ветер/растрёпанность)].
- «Jet-black hair in a casual classical low bun fixed with a plain jade hairpin; loose strands sway in the breeze»
- «Caramel-brown slightly curly long hair, naturally fluffy just-woke-up messiness, strands over the collarbone»

### 6. [Одежда/Фактура] — стиль
Под-формула: [крой/паттерн] + [цвет] + [конкретный предмет одежды] + [материал/степень новизны] + [способ ношения/деталь].
- «A loose, worn dark-brown motorcycle leather jacket with real wear creases and reflective metal zippers, over a washed-out gray T-shirt»

### 7. [Телосложение/Эмоция/Темперамент] — композиция и настроение
Под-формула: [скелет/плечи] + [композиция/тип кадра] + [действие/направление взгляда] + [слова атмосферы]. Если композиция и действия уже описаны в основном промпте — среднюю часть можно убрать.
- «Slim figure, slender shoulders. Close-up above the chest, direct gaze at the camera. Gentle, graceful classical-romantic temperament»

## Дополнительные приёмы реализма (из User Guide)

- Для фотореализма добавлять ключевые слова: «native skin texture», «hair roots distinct».
- Для животных: подчёркивать fluffy natural fur texture.
- Сложные движения описывать конкретно и подробно — Seedance 2.5 особенно хорошо держит «long-tail» движения (танцы, боевые искусства, микромимика): «a martial artist performs a complex backflip in the rain, quickly draws a long sword after landing, rain slides down the blade».
- Для мультишотовых роликов: удерживать базовое описание черт персонажа во всех кадрах — консистентность при монтажных склейках сохранится.
- Голос: TTS-механистичность в 2.5 ослаблена сильнее, чем в 2.0; для естественности диалога задавать манеру речи и эмоцию (см. camera-emotion.md).

## Мультиперсонажные сцены

См. `multi-reference.md` — раздел про привязку персонажей. Ключевое: у каждого персонажа свой референс и явный запрет на обмен чертами: «Do not interchange the characters' appearances, clothing, actions, positions, or dialogue.»
