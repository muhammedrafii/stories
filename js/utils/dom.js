export function getEl(id) {
    return document.getElementById(id);
}

export function hide(el) {
    if (typeof el === 'string') el = getEl(el);
    if (el) el.classList.add('hidden');
}

export function show(el) {
    if (typeof el === 'string') el = getEl(el);
    if (el) el.classList.remove('hidden');
}

export function toggleHidden(el) {
    if (typeof el === 'string') el = getEl(el);
    if (el) el.classList.toggle('hidden');
}