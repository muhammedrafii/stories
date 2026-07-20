export function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
}

export function getInitials(name) {
    if (!name) return 'US';
    return name.substring(0, 2).toUpperCase();
}