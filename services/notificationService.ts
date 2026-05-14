
// This service creates pre-configured instances of SweetAlert2
// to ensure consistent UI/UX across the application.

import Swal from 'sweetalert2';

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

let progressInterval: number | null = null;
let currentProgress = 0;

// Loading Modal (Non-dismissible)
export const showLoading = (title: string, text: string, withProgress: boolean = false) => {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    
    currentProgress = 0;

    swal.fire({
        title: title,
        html: withProgress ? `
            <div class="text-sm text-slate-500 mb-4">${text}</div>
            <div class="w-full max-w-xs mx-auto bg-slate-200 rounded-full h-3 mb-2 overflow-hidden">
                <div id="swal-progress-bar" class="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" style="width: 0%"></div>
            </div>
            <div id="swal-progress-text" class="text-xs font-bold text-blue-600 animate-pulse">0%</div>
        ` : `<div class="text-sm text-slate-500">${text}</div>`,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
            
            if (withProgress) {
                progressInterval = window.setInterval(() => {
                    // Slow down progress as it reaches 95%
                    const remaining = 95 - currentProgress;
                    const increment = Math.max(0.5, remaining * 0.05);
                    
                    if (currentProgress < 95) {
                        currentProgress += increment;
                        if (currentProgress > 95) currentProgress = 95;
                    }
                    
                    const roundedProgress = Math.floor(currentProgress);
                    const progressBar = document.getElementById('swal-progress-bar');
                    const progressText = document.getElementById('swal-progress-text');
                    
                    if (progressBar && progressText) {
                        progressBar.style.width = `${roundedProgress}%`;
                        progressText.innerText = `${roundedProgress}%`;
                    }
                }, 500);
            }
        }
    });
};

export const closeLoading = () => {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
        
        // Push to 100% before closing to give a complete feeling
        const progressBar = document.getElementById('swal-progress-bar');
        const progressText = document.getElementById('swal-progress-text');
        if (progressBar && progressText) {
            progressBar.style.width = `100%`;
            progressText.innerText = `100%`;
            progressText.classList.remove('animate-pulse');
        }
        
        setTimeout(() => {
            Swal.close();
        }, 400); // Wait slightly for the animation to finish
    } else {
        Swal.close();
    }
};
