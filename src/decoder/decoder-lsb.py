import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from PIL import Image, ImageTk
import numpy as np
import threading
import queue
import os

class LSBDecoder:
    def _init_(self, root):
        self.root = root
        self.root.title("LSB Steganography Detector")
        self.root.geometry("900x600")
        self.root.configure(bg="#f0f0f0")

        self.image_path = None
        self.original_image = None
        self.analysis_queue = queue.Queue()

        self.create_widgets()
        self.check_queue()

    def create_widgets(self):
        # Header
        header = tk.Label(self.root, text="LSB Steganography Detector",
                          font=("Arial", 20, "bold"), bg="#2c3e50", fg="white", height=2)
        header.pack(fill="x")

        # Image frame
        img_frame = tk.Frame(self.root, bg="white", bd=2, relief="sunken")
        img_frame.pack(side="left", fill="both", expand=True, padx=20, pady=20)

        self.image_label = tk.Label(img_frame, text="No image selected", bg="white", fg="gray")
        self.image_label.pack(expand=True)

        # Controls
        control_frame = tk.Frame(self.root, bg="#f0f0f0")
        control_frame.pack(side="top", fill="x", padx=20)

        self.browse_btn = tk.Button(control_frame, text="Browse Image", command=self.browse_file,
                                    bg="#3498db", fg="white", font=("Arial", 12))
        self.browse_btn.pack(side="left", padx=5, pady=5)

        self.analyze_btn = tk.Button(control_frame, text="Analyze", command=self.analyze_image,
                                     bg="#2ecc71", fg="white", font=("Arial", 12), state="disabled")
        self.analyze_btn.pack(side="left", padx=5, pady=5)

        self.progress = ttk.Progressbar(control_frame, mode="indeterminate")
        self.progress.pack(side="left", padx=20, pady=5)

        # Results frame
        self.results_text = tk.Text(self.root, height=20, width=50, wrap="word", font=("Courier", 10))
        self.results_text.pack(side="right", fill="both", expand=True, padx=20, pady=20)

    def browse_file(self):
        file_path = filedialog.askopenfilename(
            title="Select Image",
            filetypes=[("Image files", ".png;.jpg;.jpeg;.bmp;*.tiff")]
        )
        if file_path:
            self.image_path = file_path
            self.load_image()
            self.analyze_btn.config(state="normal")

    def load_image(self):
        try:
            img = Image.open(self.image_path)
            img.thumbnail((400, 400))
            self.original_image = ImageTk.PhotoImage(img)
            self.image_label.config(image=self.original_image, text="")
        except Exception as e:
            messagebox.showerror("Error", f"Could not open image: {str(e)}")

    def analyze_image(self):
        if not self.image_path:
            return

        self.browse_btn.config(state="disabled")
        self.analyze_btn.config(state="disabled")
        self.progress.start(10)
        self.results_text.delete("1.0", tk.END)
        self.results_text.insert(tk.END, "Analyzing...\n")

        thread = threading.Thread(target=self.analysis_thread)
        thread.daemon = True
        thread.start()

    def analysis_thread(self):
        try:
            result, message = self.detect_lsb(self.image_path)
            self.analysis_queue.put(("result", result, message))
        except Exception as e:
            self.analysis_queue.put(("error", str(e)))

    def check_queue(self):
        try:
            while True:
                msg = self.analysis_queue.get_nowait()
                if msg[0] == "result":
                    self.show_results(msg[1], msg[2])
                elif msg[0] == "error":
                    messagebox.showerror("Error", msg[1])
                    self.browse_btn.config(state="normal")
                    self.analyze_btn.config(state="normal")
                    self.progress.stop()
        except queue.Empty:
            pass
        finally:
            self.root.after(100, self.check_queue)

    def show_results(self, result, message):
        self.progress.stop()
        self.browse_btn.config(state="normal")
        self.analyze_btn.config(state="normal")

        self.results_text.delete("1.0", tk.END)
        self.results_text.insert(tk.END, f"Detection Result: {result}\n\n")
        if message:
            self.results_text.insert(tk.END, f"Extracted Message:\n{message}\n")
        else:
            self.results_text.insert(tk.END, "No hidden message detected.\n")

    def detect_lsb(self, image_path):
        img = Image.open(image_path)
        img = img.convert("RGB")
        data = np.array(img)

        # Flatten all RGB channels into 1D array
        lsb_bits = (data & 1).flatten()

        # Convert bits to bytes
        n_bytes = len(lsb_bits) // 8
        bytes_array = lsb_bits[:n_bytes*8].reshape(-1, 8)

        message = ""
        for byte in bytes_array:
            val = 0
            for i, bit in enumerate(byte):
                val |= bit << (7 - i)
            if val == 0:
                break
            if 32 <= val <= 126:  # Printable ASCII
                message += chr(val)
            else:
                # Stop decoding if non-printable byte appears
                break

        # Determine detection
        if len(message) > 0:
            return "Yes", message
        else:
            return "No", ""

if _name_ == "_main_":
    root = tk.Tk()
    app = LSBDecoder(root)
    root.mainloop()