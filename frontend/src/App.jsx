// document-generator/frontend/src/App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Rnd } from 'react-rnd';
import './App.css';

const BACKGROUND_IMAGE_URL = 'https://via.placeholder.com/800x1200?text=Upload+Your+Template+Here';
// Коэффициент масштабирования 140/50 = 2.8 для уменьшения визуальной области
const SCALE_FACTOR = 2.8;

// Расстояние в пикселях для срабатывания "прилипания" к направляющей
const SNAP_DISTANCE = 5;

// БЕЗОПАСНАЯ КОНСТАНТА ДЛЯ ИНИЦИАЛИЗАЦИИ РАЗМЕРА РЕДАКТОРА
const initialEditorSize = { width: 600, height: 900 };

const initialBox = {
    id: 'block-1',
    x: 100,
    y: 100,
    width: 300,
    height: 50,
    fontSize: 24,
    color: '#1e1e1e',
    backgroundColor: '#ffffff',
    isBackgroundTransparent: true,
    template: '{Фамилия} {Имя}',
    alignment: 'left',
    fontName: 'Arial',
    conditionKey: '',
    ifEmptyText: '',
    // НОВЫЕ ПОЛЯ
    shrinkToFit: false,
    textCase: 'none',
};

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// --- Компонент Тост-Уведомлений и Спиннер ---
const ToastNotification = ({ message, type, id, removeToast }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            removeToast(id);
        }, 5000);

        return () => clearTimeout(timer);
    }, [id, removeToast]);

    return (
        <div className={`toast toast-${type}`}>
            {message}
        </div>
    );
};

const LoadingSpinner = () => (
    <div className="loading-overlay">
        <div className="spinner"></div>
        <p>Идет генерация документов, пожалуйста, подождите...</p>
    </div>
);

// --- Основной Компонент App ---
function App() {
    const [boxes, setBoxes] = useState([initialBox]);
    const [selectedBoxId, setSelectedBoxId] = useState(initialBox.id);
    const [availableKeys, setAvailableKeys] = useState([]);
    const [templateURL, setTemplateURL] = useState(BACKGROUND_IMAGE_URL);
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [editorSize, setEditorSize] = useState(initialEditorSize);
    const [isGenerating, setIsGenerating] = useState(false);
    const [availableFonts, setAvailableFonts] = useState(['Arial']);
    const fontFileInputRef = useRef(null);
    const [toasts, setToasts] = useState([]);
    const [theme, setTheme] = useState('light');

    // Инициализация Направляющих
    const [guides, setGuides] = useState({
        vertical: [initialEditorSize.width / 2],
        horizontal: [initialEditorSize.height / 2],
    });

    // Настройки генерации
    const [generationOptions, setGenerationOptions] = useState({
        fileNameTemplate: 'Документ_{INDEX}',
        outputMode: 'zip',
    });

    const selectedBox = boxes.find(box => box.id === selectedBoxId);


    // --- Toast Уведомления и Theme ---
    const addToast = (message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
    };

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    // --- Эффект 1: Загрузка шрифтов ---
    // Внутри компонента App, рядом с другими useEffect
    useEffect(() => {
        const fetchFonts = async () => {
            try {
                const response = await fetch(`${apiUrl}/available-fonts/`);
                const data = await response.json();

                // Сохраняем только имена для выпадающего списка
                setAvailableFonts(data.map(f => f.name));

                // Генерируем CSS для браузера
                let fontStyles = "";
                data.forEach(font => {
                    const format = font.file.endsWith('.otf') ? 'opentype' : 'truetype';
                    fontStyles += `
            @font-face {
              font-family: '${font.name}';
              src: url('${apiUrl}/fonts/${font.file}') format('${format}');
              font-display: swap;
            }
          `;
                });

                // Создаем style тег в head
                const styleId = "dynamic-fonts-css";
                let styleTag = document.getElementById(styleId);
                if (!styleTag) {
                    styleTag = document.createElement("style");
                    styleTag.id = styleId;
                    document.head.appendChild(styleTag);
                }
                styleTag.innerHTML = fontStyles;

            } catch (err) {
                console.error("Ошибка загрузки шрифтов:", err);
            }
        };
        fetchFonts();
    }, [apiUrl]);

    // --- Эффект 2: Обновление центральных направляющих ---
    useEffect(() => {
        setGuides(prev => {
            const isInitialCenterV = (x) => Math.abs(x - initialEditorSize.width / 2) < 1;
            const isInitialCenterH = (y) => Math.abs(y - initialEditorSize.height / 2) < 1;

            const userVerticalGuides = prev.vertical.filter(x => !isInitialCenterV(x));
            const userHorizontalGuides = prev.horizontal.filter(y => !isInitialCenterH(y));

            return {
                vertical: [...userVerticalGuides, editorSize.width / 2].sort((a, b) => a - b),
                horizontal: [...userHorizontalGuides, editorSize.height / 2].sort((a, b) => a - b),
            };
        });
    }, [editorSize]);

    // ----------------------------------------------------
    // 1. Логика Снаппинга (Snapping Logic)
    // ----------------------------------------------------
    const handleSnap = useCallback((position, size) => {
        let { x, y } = position;
        let { width, height } = size;

        // Снап по вертикальным направляющим
        guides.vertical.forEach(guideX => {
            // Снап к левому краю
            if (Math.abs(x - guideX) <= SNAP_DISTANCE) {
                x = guideX;
            }
            // Снап к правому краю
            if (Math.abs(x + width - guideX) <= SNAP_DISTANCE) {
                x = guideX - width;
            }
            // Снап к центру блока
            if (Math.abs(x + width / 2 - guideX) <= SNAP_DISTANCE) {
                x = guideX - width / 2;
            }
        });

        // Снап по горизонтальным направляющим
        guides.horizontal.forEach(guideY => {
            // Снап к верхнему краю
            if (Math.abs(y - guideY) <= SNAP_DISTANCE) {
                y = guideY;
            }
            // Снап к нижнему краю
            if (Math.abs(y + height - guideY) <= SNAP_DISTANCE) {
                y = guideY - height;
            }
            // Снап к центру блока
            if (Math.abs(y + height / 2 - guideY) <= SNAP_DISTANCE) {
                y = guideY - height / 2;
            }
        });

        return { x, y };
    }, [guides]);

    // ----------------------------------------------------
    // 2. Управление блоками (ИСПРАВЛЕНО: ГАРАНТИЯ ПРИСУТСТВИЯ)
    // ----------------------------------------------------

    const addBlock = () => {
        const newId = `block-${boxes.length + 1}`;
        const newBox = {
            ...initialBox,
            id: newId,
            x: 100 + (boxes.length * 10) % 50, // Небольшое смещение
            y: 100 + (boxes.length * 10) % 50,
            template: `Новый Блок {КЛЮЧ}`,
            backgroundColor: initialBox.backgroundColor,
            isBackgroundTransparent: true,
            shrinkToFit: false,
            textCase: 'none',
        };
        setBoxes(prev => [...prev, newBox]);
        setSelectedBoxId(newId);
        addToast(`Добавлен блок ${newId}.`, 'success');
    };

    const deleteBlock = () => {
        if (!selectedBoxId) return;

        setBoxes(prev => prev.filter(box => box.id !== selectedBoxId));

        const remainingBoxes = boxes.filter(box => box.id !== selectedBoxId);
        if (remainingBoxes.length > 0) {
            setSelectedBoxId(remainingBoxes[0].id);
        } else {
            setSelectedBoxId(null);
        }

        addToast(`Блок ${selectedBoxId} удален.`, 'info');
    };

    // ----------------------------------------------------
    // 3. Обработка изменений позиции/размера блока
    // ----------------------------------------------------
    const handleBoxChange = (id, newPosition, newSize) => {
        setBoxes(prevBoxes =>
            prevBoxes.map(box => {
                if (box.id === id) {
                    let updatedPosition = newPosition ? newPosition : { x: box.x, y: box.y };
                    let updatedSize = newSize ? { width: parseInt(newSize.width), height: parseInt(newSize.height) } : { width: box.width, height: box.height };

                    // Применяем снаппинг к конечной позиции
                    const snappedPosition = handleSnap(updatedPosition, updatedSize);

                    return {
                        ...box,
                        x: snappedPosition.x,
                        y: snappedPosition.y,
                        width: updatedSize.width,
                        height: updatedSize.height,
                    };
                }
                return box;
            })
        );
    };

    // ----------------------------------------------------
    // 4. Обработка изменений стиля
    // ----------------------------------------------------
    const handleStyleChange = (key, value) => {
        setBoxes(prevBoxes =>
            prevBoxes.map(box => {
                if (box.id === selectedBoxId) {
                    if (key === 'fontSize') {
                        const numValue = value === '' ? '' : parseInt(value, 10);
                        return { ...box, [key]: numValue };
                    }
                    return { ...box, [key]: value };
                }
                return box;
            })
        );
    };

    // --- Вставка ключа в текстовое поле ---
    const handleInsertKey = (key) => {
        if (!selectedBox) return;
        const keyTag = `{${key}}`;
        const templateField = document.getElementById('template-textarea');

        let newTemplate = selectedBox.template || "";

        if (templateField) {
            const start = templateField.selectionStart;
            const end = templateField.selectionEnd;

            newTemplate = newTemplate.substring(0, start) + keyTag + newTemplate.substring(end);

            setTimeout(() => {
                templateField.selectionStart = templateField.selectionEnd = start + keyTag.length;
            }, 0);

        } else {
            newTemplate = (newTemplate + ' ' + keyTag).trim();
        }

        handleStyleChange('template', newTemplate);
    };

    // ----------------------------------------------------
    // 5. Управление Направляющими
    // ----------------------------------------------------

    const handleGuideDrag = useCallback((index, orientation, newPos) => {
        let pos = Math.max(0, newPos);

        if (orientation === 'vertical') {
            pos = Math.min(pos, editorSize.width);
        } else {
            pos = Math.min(pos, editorSize.height);
        }

        setGuides(prev => {
            const newGuides = [...prev[orientation]];
            newGuides[index] = pos;
            return {
                ...prev,
                [orientation]: newGuides
            };
        });
    }, [editorSize]);

    const addGuide = (orientation) => {
        const newGuide = orientation === 'vertical'
            ? editorSize.width * 0.25
            : editorSize.height * 0.25;

        setGuides(prev => ({
            ...prev,
            [orientation]: [...prev[orientation], newGuide].sort((a, b) => a - b)
        }));
        addToast(`Добавлена ${orientation === 'vertical' ? 'вертикальная' : 'горизонтальная'} направляющая.`, 'info');
    };

    const deleteGuide = (index, orientation) => {
        setGuides(prev => {
            const guideValue = prev[orientation][index];
            const isCenterLine = orientation === 'vertical'
                ? Math.abs(guideValue - editorSize.width / 2) < 1
                : Math.abs(guideValue - editorSize.height / 2) < 1;

            if (isCenterLine) {
                addToast("Центральные направляющие удалять нельзя. Добавьте пользовательские линии, чтобы их удалять.", 'info');
                return prev;
            }

            return {
                ...prev,
                [orientation]: prev[orientation].filter((_, i) => i !== index)
            };
        });
        addToast(`Направляющая удалена.`, 'info');
    };

    // --- Функции загрузки ---
    const handleDataUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${apiUrl}/upload-data/`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ошибка загрузки данных.");
            }

            const result = await response.json();
            setAvailableKeys(result.keys);
            setIsDataLoaded(true);
            addToast(`Данные загружены. Найдено ${result.count} записей и ${result.keys.length} ключей.`, 'success');

        } catch (error) {
            console.error("Ошибка загрузки данных:", error);
            addToast(error.message, 'error');
        } finally {
            event.target.value = null;
        }
    };

    const handleFontUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${apiUrl}/upload-font/`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ошибка загрузки шрифта.");
            }

            const result = await response.json();
            setAvailableFonts(prev => [...prev, result.font_name]);
            handleStyleChange('fontName', result.font_name);
            addToast(`Шрифт "${result.font_name}" успешно загружен и выбран.`, 'success');

        } catch (error) {
            console.error("Ошибка загрузки шрифта:", error);
            addToast(error.message, 'error');
        } finally {
            event.target.value = null;
        }
    };

    const handleTemplateUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const isPdf = file.type === 'application/pdf';
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${apiUrl}/upload-template/`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Ошибка загрузки шаблона.");
            }

            const result = await response.json();

            // Устанавливаем размер редактора (теперь берем из ответа бэкенда)
            setEditorSize({
                width: result.width / SCALE_FACTOR,
                height: result.height / SCALE_FACTOR
            });

            if (isPdf) {
                // Если PDF — берем сконвертированную картинку с бэкенда
                const timestamp = new Date().getTime();
                setTemplateURL(`${apiUrl}/uploads/current_template.png?t=${timestamp}`);
            } else {
                // Если обычная картинка — можно оставить локальную ссылку для скорости
                const localUrl = URL.createObjectURL(file);
                setTemplateURL(localUrl);
            }

            addToast(`Шаблон "${result.filename}" загружен.`, 'success');

        } catch (error) {
            console.error("Ошибка загрузки шаблона:", error);
            addToast(error.message, 'error');
        } finally {
            event.target.value = null;
        }
    };


    // ----------------------------------------------------
    // 6. Отправка данных на Backend и скачивание ZIP
    // ----------------------------------------------------
    const handleGenerate = async () => {
        const editorEl = document.getElementById('editor-area');
        if (!editorEl) return;

        if (!selectedBox || selectedBox.fontSize === '' || selectedBox.fontSize <= 0) {
            addToast("Ошибка: У выбранного блока некорректный размер шрифта (должен быть > 0).", 'error');
            return;
        }

        setIsGenerating(true);

        const { offsetWidth: templateWidth, offsetHeight: templateHeight } = editorEl;

        const configData = boxes.map(box => ({
            ...box,
            // Отправляем X, Y, ШИРИНУ и ВЫСОТУ в процентах
            x_percent: (box.x / templateWidth) * 100,
            y_percent: (box.y / templateHeight) * 100,
            width_percent: (box.width / templateWidth) * 100,
            height_percent: (box.height / templateHeight) * 100,

            conditionKey: box.conditionKey,
            ifEmptyText: box.ifEmptyText,
            // НОВЫЕ ПОЛЯ
            shrinkToFit: box.shrinkToFit,
            textCase: box.textCase,

            backgroundColor: box.isBackgroundTransparent ? undefined : box.backgroundColor
        }));

        const downloadFileName = generationOptions.outputMode === 'zip' ? 'documents.zip' : 'merged_documents.pdf';

        try {
            const response = await fetch(`${apiUrl}/generate/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_config: configData,
                    generation_options: generationOptions,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                let errorDetail = `Нет деталей. Ответ: ${errorText.substring(0, 100)}`;
                try {
                    const errorData = JSON.parse(errorText);
                    errorDetail = errorData.detail || errorDetail;
                } catch { }

                throw new Error(`Ошибка: ${response.status}. Детали: ${errorDetail}`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            const contentDisposition = response.headers.get('Content-Disposition');
            const filenameMatch = contentDisposition && contentDisposition.match(/filename="(.+)"/);
            a.download = filenameMatch ? filenameMatch[1] : downloadFileName;

            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            addToast("Генерация завершена! Началось скачивание.", 'success');

        } catch (error) {
            console.error("Критическая ошибка:", error);
            addToast(error.message || "Ошибка генерации. Проверьте консоль.", 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    // ----------------------------------------------------
    // 7. UI Рендер
    // ----------------------------------------------------

    const isGenerateDisabled = !isDataLoaded || templateURL === BACKGROUND_IMAGE_URL || isGenerating || !selectedBox || selectedBox.fontSize === '' || selectedBox.fontSize <= 0;

    const fileNameKeys = availableKeys.concat(['INDEX']);

    return (
        <div className={`app-container ${theme}-theme`}>
            {isGenerating && <LoadingSpinner />}

            <div className="toast-container">
                {toasts.map(toast => (
                    <ToastNotification key={toast.id} {...toast} removeToast={removeToast} />
                ))}
            </div>

            <div className="header-bar">
                <h1>DocGEN MVP 🚀</h1>
                <button className="theme-toggle" onClick={toggleTheme}>
                    {theme === 'light' ? '🌙 Темная тема' : '☀️ Светлая тема'}
                </button>
            </div>

            <div className="main-content">

                {/* Панель настроек (Справа) */}
                <div className="settings-panel">

                    <div className="control-group block-controls">
                        {/* ЗДЕСЬ ИСПОЛЬЗУЮТСЯ ФУНКЦИИ addBlock и deleteBlock */}
                        <button className="control-button add" onClick={addBlock}>+ Добавить Блок</button>
                        <button className="control-button delete" onClick={deleteBlock} disabled={!selectedBox}>Удалить Блок</button>
                    </div>

                    <h2 className="selected-block-header">{selectedBox ? `Блок: ${selectedBox.id}` : 'Выберите блок'}</h2>

                    {selectedBox ? (
                        <div className="box-settings">

                            {/* Шаблон текста */}
                            <label className="setting-label">Шаблон текста (например: "Привет {`{ИМЯ}`}!"):</label>
                            <textarea
                                id="template-textarea"
                                rows="3"
                                value={selectedBox.template}
                                onChange={(e) => handleStyleChange('template', e.target.value)}
                                placeholder="Введите текст с ключами из таблицы в формате {КЛЮЧ}"
                                className="template-main-input"
                            />

                            <div className="key-list-helper">
                                <label className="key-helper-label">Доступные ключи (Кликните для вставки):</label>
                                <div className="key-tags-container">
                                    {availableKeys.map(key => (
                                        <span
                                            key={key}
                                            className="key-tag-helper"
                                            onClick={() => handleInsertKey(key)}
                                        >
                                            {`{${key}}`}
                                        </span>
                                    ))}
                                </div>
                            </div>


                            {/* Условный рендеринг */}
                            <div className="conditional-group">
                                <label className="setting-label">Условие (IF-THEN):</label>
                                <div className="conditional-key-select">
                                    <span className="conditional-prefix">ЕСЛИ ключ:</span>
                                    <select
                                        value={selectedBox.conditionKey}
                                        onChange={(e) => handleStyleChange('conditionKey', e.target.value)}
                                    >
                                        <option value="">Не задано (Всегда вставлять)</option>
                                        {availableKeys.map(key => <option key={key} value={key}>{key}</option>)}
                                    </select>
                                </div>
                                <div className="setting-item">
                                    <label className="setting-label">ТО вставить текст, если ключ ПУСТ:</label>
                                    <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(e) => handleFileUpload(e, 'template')}
                                        style={{ display: 'none' }}
                                        id="template-upload"
                                    />
                                </div>
                            </div>

                            {/* НОВОЕ: Преобразование Регистра и ShrinkToFit */}
                            <div className="setting-item">
                                <label className="setting-label">Преобразование регистра:</label>
                                <select
                                    value={selectedBox.textCase}
                                    onChange={(e) => handleStyleChange('textCase', e.target.value)}
                                >
                                    <option value="none">Без изменений</option>
                                    <option value="upper">ВСЕ ЗАГЛАВНЫЕ (КАПСОМ)</option>
                                    <option value="lower">все строчные (только маленькими)</option>
                                    <option value="title">Каждое Слово С Большой</option>
                                    <option value="sentence">С большой буквы с начала предложения</option>
                                </select>
                            </div>

                            <div className="setting-item output-mode-item">
                                <label className="setting-label output-mode-label">
                                    <input
                                        type="checkbox"
                                        checked={selectedBox.shrinkToFit}
                                        onChange={(e) => handleStyleChange('shrinkToFit', e.target.checked)}
                                    />
                                    **Уменьшать текст** (если выходит за рамки блока)
                                </label>
                                <p className="hint-text">Автоматически уменьшит шрифт, чтобы он поместился в блок.</p>
                            </div>


                            {/* Группа: Выравнивание и Размер */}
                            <div className="two-column-group">
                                <div className="setting-item">
                                    <label className="setting-label">Выравнивание:</label>
                                    <select
                                        value={selectedBox.alignment}
                                        onChange={(e) => handleStyleChange('alignment', e.target.value)}
                                    >
                                        <option value="left">По левому краю</option>
                                        <option value="center">По центру</option>
                                        <option value="right">По правому краю</option>
                                    </select>
                                </div>

                                <div className="setting-item">
                                    <label className="setting-label">Размер (px):</label>
                                    <input
                                        type="number"
                                        value={selectedBox.fontSize}
                                        onChange={(e) => handleStyleChange('fontSize', e.target.value)}
                                        min="1"
                                        placeholder="24"
                                    />
                                </div>
                            </div>

                            {/* Группа: Цвет Текста и Цвет Фона */}
                            <div className="two-column-group">
                                <div className="setting-item color-picker-group">
                                    <label className="setting-label">Цвет текста:</label>
                                    <input
                                        type="color"
                                        value={selectedBox.color}
                                        onChange={(e) => handleStyleChange('color', e.target.value)}
                                    />
                                </div>

                                <div className="setting-item">
                                    <label className="setting-label output-mode-label" style={{ marginTop: '25px', marginBottom: '10px' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedBox.isBackgroundTransparent}
                                            onChange={(e) => handleStyleChange('isBackgroundTransparent', e.target.checked)}
                                        />
                                        Прозрачный фон
                                    </label>

                                    {!selectedBox.isBackgroundTransparent && (
                                        <div className="setting-item color-picker-group">
                                            <label className="setting-label" style={{ marginTop: '0' }}>Цвет фона блока:</label>
                                            <input
                                                type="color"
                                                value={selectedBox.backgroundColor}
                                                onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                                            />
                                        </div>
                                    )}
                                </div>

                            </div>

                            {/* Выбор и Загрузка Шрифта */}
                            <div className="setting-item font-select-item">
                                <label className="setting-label">Шрифт:</label>
                                <div className="font-controls">
                                    <select
                                        value={selectedBox.fontName}
                                        onChange={(e) => handleStyleChange('fontName', e.target.value)}
                                    >
                                        {availableFonts.map(fontName => (
                                            <option key={fontName} value={fontName} style={{ fontFamily: fontName }}>{fontName}</option>
                                        ))}
                                    </select>
                                    <button
                                        className="upload-font-button"
                                        onClick={() => fontFileInputRef.current.click()}
                                        title="Загрузить свой TTF/OTF шрифт"
                                    >
                                        +
                                    </button>
                                    <input
                                        type="file"
                                        accept=".ttf,.otf"
                                        onChange={handleFontUpload}
                                        ref={fontFileInputRef}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                            </div>

                        </div>
                    ) : (
                        <p className="hint-text">Настройки появятся после выбора или добавления блока.</p>
                    )}

                    {/* Настройки Генерации */}
                    <div className="generation-options-group">
                        <h3>Настройки Выгрузки</h3>
                        <div className="setting-item">
                            <label className="setting-label">Шаблон имени файла:</label>
                            <textarea
                                rows="2"
                                value={generationOptions.fileNameTemplate}
                                onChange={(e) => setGenerationOptions(prev => ({ ...prev, fileNameTemplate: e.target.value }))}
                                placeholder="Например: Документ_{INDEX}_{ФАМИЛИЯ}"
                                className="template-main-input"
                            />
                            <p className="hint-text">Используйте {`{INDEX}`} для автоинкремента.</p>

                            <div className="key-list-helper">
                                <div className="key-tags-container">
                                    {fileNameKeys.map(key => (
                                        <span
                                            key={key}
                                            className="key-tag-helper"
                                            onClick={() => setGenerationOptions(prev => ({ ...prev, fileNameTemplate: (prev.fileNameTemplate + ' ' + `{${key}}`).trim() }))}
                                        >
                                            {`{${key}}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="setting-item output-mode-item">
                            <label className="setting-label output-mode-label">
                                <input
                                    type="checkbox"
                                    checked={generationOptions.outputMode === 'single_pdf'}
                                    onChange={(e) => setGenerationOptions(prev => ({
                                        ...prev,
                                        outputMode: e.target.checked ? 'single_pdf' : 'zip'
                                    }))}
                                />
                                Выгрузить одним большим PDF-файлом
                            </label>
                            <p className="hint-text">Рекомендуется для небольшого количества документов.</p>
                        </div>
                    </div>

                    {/* Направляющие (Управление) */}
                    <div className="generation-options-group">
                        <h3>Направляющие (Снаппинг) 📏</h3>
                        <p className="hint-text">Перетаскивайте линии. Кликните по пользовательской линии, чтобы удалить. Центр отмечен красным.</p>
                        <div className="control-group guide-controls">
                            <button className="control-button" onClick={() => addGuide('vertical')}>+ Вертикальная</button>
                            <button className="control-button" onClick={() => addGuide('horizontal')}>+ Горизонтальная</button>
                        </div>
                    </div>

                    <button
                        className="generate-button"
                        onClick={handleGenerate}
                        disabled={isGenerateDisabled}
                    >
                        {isGenerating ? 'Генерация...' : '🚀 Запустить Генерацию'}
                    </button>
                </div>

                {/* Область Редактирования (Слева) */}
                <div className="editor-side">
                    <div className="file-upload-controls">
                        <label className="file-input-label green">
                            Загрузить Шаблон 🖼️
                            <input type="file" accept="image/*,.pdf" onChange={handleTemplateUpload} />
                        </label>

                        <label className="file-input-label blue">
                            Загрузить Данные 📊
                            <input type="file" accept=".xlsx, .xls, .csv" onChange={handleDataUpload} />
                        </label>
                    </div>

                    <div
                        id="editor-area"
                        className="editor-area"
                        style={{
                            backgroundImage: `url(${templateURL})`,
                            width: `${editorSize.width}px`,
                            height: `${editorSize.height}px`
                        }}
                    >

                        {/* Рендер Направляющих */}
                        {guides.vertical.map((xPos, index) => {
                            const isCenterLine = Math.abs(xPos - editorSize.width / 2) < 1;
                            return (
                                <Rnd
                                    key={`v-guide-${index}`}
                                    size={{ width: 1, height: '100%' }}
                                    position={{ x: xPos, y: 0 }}
                                    onDragStop={(e, d) => handleGuideDrag(index, 'vertical', d.x)}
                                    onClick={(e) => { e.stopPropagation(); deleteGuide(index, 'vertical'); }}
                                    bounds="parent"
                                    disableDragging={isCenterLine}
                                    enableResizing={false}
                                    style={{
                                        backgroundColor: isCenterLine ? 'red' : 'var(--guide-color)',
                                        cursor: isCenterLine ? 'default' : 'ew-resize',
                                        zIndex: 100,
                                        opacity: 0.6
                                    }}
                                />
                            );
                        })}

                        {guides.horizontal.map((yPos, index) => {
                            const isCenterLine = Math.abs(yPos - editorSize.height / 2) < 1;
                            return (
                                <Rnd
                                    key={`h-guide-${index}`}
                                    size={{ width: '100%', height: 1 }}
                                    position={{ x: 0, y: yPos }}
                                    onDragStop={(e, d) => handleGuideDrag(index, 'horizontal', d.y)}
                                    onClick={(e) => { e.stopPropagation(); deleteGuide(index, 'horizontal'); }}
                                    bounds="parent"
                                    disableDragging={isCenterLine}
                                    enableResizing={false}
                                    style={{
                                        backgroundColor: isCenterLine ? 'red' : 'var(--guide-color)',
                                        cursor: isCenterLine ? 'default' : 'ns-resize',
                                        zIndex: 100,
                                        opacity: 0.6
                                    }}
                                />
                            );
                        })}

                        {boxes.map(box => (
                            <Rnd
                                key={box.id}
                                size={{ width: box.width, height: box.height }}
                                position={{ x: box.x, y: box.y }}
                                onDragStop={(e, d) => { handleBoxChange(box.id, { x: d.x, y: d.y }, null); }}
                                onResizeStop={(e, direction, ref, delta, position) => {
                                    handleBoxChange(box.id, position, {
                                        width: ref.style.width,
                                        height: ref.style.height,
                                    });
                                }}
                                bounds="parent"
                                className={box.id === selectedBoxId ? 'selected-box' : ''}
                                style={{
                                    border: box.id === selectedBoxId ? '2px solid var(--accent-color)' : '1px dashed var(--border-color)',
                                    backgroundColor: box.isBackgroundTransparent ? 'transparent' : box.backgroundColor,
                                    borderRadius: '4px',
                                    boxShadow: box.id === selectedBoxId ? '0 0 10px var(--accent-shadow)' : 'none',
                                    cursor: 'grab',
                                    zIndex: box.id === selectedBoxId ? 200 : 150,
                                }}
                                onClick={() => setSelectedBoxId(box.id)}
                            >
                                {/* 1. Внешний контейнер (Flexbox для вертикального центрирования) */}
                                <div
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '5px',
                                    }}
                                >
                                    {/* 2. Внутренний контейнер (Block для горизонтального выравнивания и переноса) */}
                                    <div
                                        style={{
                                            width: '100%',
                                            textAlign: box.alignment,
                                            fontSize: `${box.fontSize / SCALE_FACTOR}pt`,
                                            color: box.color,

                                            // ИСПРАВЛЕННАЯ СТРОКА:
                                            fontFamily: `"${box.fontName}", Arial, sans-serif`,

                                            overflow: 'hidden',
                                            wordWrap: 'break-word',
                                        }}
                                    >
                                        {/* Рендеринг текста шаблона для визуализации */}
                                        {box.template.split(/(\{.*?\})/g).map((part, index) => {
                                            if (part === "") return null;

                                            const isKey = part.startsWith('{') && part.endsWith('}');

                                            return (
                                                <span
                                                    key={index}
                                                    style={{ fontWeight: isKey ? 'bold' : 'normal', whiteSpace: 'pre-wrap' }}
                                                >
                                                    {isKey ? part.replace(/\{|\}/g, '') : part}
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>
                            </Rnd>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;