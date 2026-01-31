// This service creates pre-configured instances of SweetAlert2
// to ensure consistent UI/UX across the application.

// Menggunakan deklarasi global sesuai kode asli Anda (CDN version)
// untuk menghindari error jika paket 'sweetalert2' tidak terinstall via npm
declare var Swal: any;

// Standard Popup (Confirmations, Alerts)
export const swal = Swal.mixin({
    customClass: {
        popup: 'rounded-2xl shadow-xl border border-slate-100 font-sans',
        confirmButton: 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all mx-1',
        cancelButton: 'bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-2.5 px-6 rounded-lg transition-all mx-1',
        denyButton: 'bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all mx-1'
    },
    buttonsStyling: false,
    confirmButtonText: 'Ya, Lanjutkan',
    cancelButtonText: 'Batal',
    reverseButtons: true
});

// Toast Notification (Top-Right, Auto-close)
export const toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: {
        popup: 'rounded-xl shadow-lg border border-slate-100 font-sans bg-white',
        title: 'text-sm font-bold text-slate-800',
        timerProgressBar: 'bg-blue-600'
    },
    didOpen: (toast: any) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

// Loading Modal (Non-dismissible)
export const showLoading = (title: string, text: string) => {
    swal.fire({
        title: title,
        text: text,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });
};

export const closeLoading = () => {
    Swal.close();
};