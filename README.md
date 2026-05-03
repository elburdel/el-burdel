# El Burdel — Hub de Juegos Interactivos

**El Burdel** es una plataforma web interactiva diseñada para una comunidad de streaming. Ofrece una experiencia inmersiva con minijuegos en tiempo real, ranking de jugadores y un panel de administración completo para controlar el flujo de las partidas en vivo.

## ✨ Características Principales

*   **Sistema de Cuentas y Roles:** Autenticación de usuarios mediante Firebase. Los nuevos usuarios deben ser aprobados por un administrador antes de poder jugar.
*   **Juegos en Tiempo Real:**
    *   **Taboo:** Juego de descripción de palabras por equipos (Rojo y Azul). El admin controla los turnos, el tiempo, los puntajes y envía las tarjetas de manera oculta al jugador que describe y al veedor.
    *   **Wordle (El Burdel):** Versión personalizada con modos de 5 y 6 letras. Los jugadores compiten diariamente por sumar puntos al ranking global.
*   **Ranking Global:** Tabla de clasificación automática que muestra a los mejores jugadores según sus victorias y rachas en Wordle, con soporte para medallas (oro, plata, bronce).
*   **Panel de Administración Integral:** 
    *   Control de usuarios (aprobar, pausar, eliminar, resetear contraseña).
    *   Gestión en vivo de los juegos (forzar palabras, cambiar modos, resetear partidas).
    *   Tablón de anuncios en tiempo real.
    *   Editor de mazo de cartas para Taboo integrado.

## 🛠 Tecnologías Utilizadas

*   **Frontend:** HTML5, CSS3 (Custom Properties, Flexbox/Grid, Animaciones CSS) y Vanilla JavaScript (Módulos ES6).
*   **Backend & Base de Datos:** [Firebase](https://firebase.google.com/) (Authentication y Realtime Database).
*   **Diseño:** UI/UX con temática "Speakeasy/Cabaret", diseño responsivo, glassmorphism y micro-interacciones.

## 🚀 Despliegue y Desarrollo Local

1.  Clona el repositorio.
2.  Dado que utiliza Firebase, necesitas servir los archivos a través de un servidor HTTP local para evitar problemas de CORS con los módulos ES6.
    *   Si usas VS Code, puedes usar la extensión **Live Server**.
    *   Si usas Python, puedes ejecutar: `python -m http.server 3000` en la raíz del proyecto.
3.  Abre `http://localhost:3000` en tu navegador.

*(Nota: Asegúrate de tener configuradas correctamente las reglas de seguridad en Firebase Realtime Database para la gestión de roles).*

## 📜 Licencia
Todos los derechos reservados © 2025 El Burdel.
