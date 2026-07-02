import { getLanguage } from "@/lib/languages";

/**
 * Prospect-facing UI strings, localized to the org's SELLING language. These are
 * the surfaces a prospect (not a rep) sees: the hosted lead form, the public
 * booking page, the booking confirmation email, and the unsubscribe pages. The
 * rep-facing app stays English; the AI already drafts outreach in this language.
 *
 * `en` is the complete base; every other catalog is a Partial merged over it, so
 * a missing key degrades to English instead of breaking a page. Templates carry
 * {tokens} resolved by fill().
 */

export interface ProspectStrings {
  /** Text direction for page containers ("rtl" for Arabic). */
  dir: "ltr" | "rtl";

  // Manage / cancel a booking (cancel page + the email's manage link)
  emailManage: string;
  cancelHeading: string;
  cancelButton: string;
  cancelledTitle: string;
  cancelledBody: string;
  cancelRebook: string;
  cancelGoneTitle: string;
  cancelGoneBody: string;

  // Hosted lead form (/f/[org])
  formUnavailableTitle: string;
  formUnavailableBody: string;
  formThanksTitle: string;
  formThanksBody: string; // {brand}
  formHeading: string; // {brand}
  formSub: string;
  formErrorNameContact: string;
  labelName: string;
  labelEmail: string;
  labelPhone: string;
  labelCompany: string;
  labelMessage: string;
  send: string;
  formFootnote: string;

  // Booking page (/book/[org])
  bookingUnavailableTitle: string;
  bookingUnavailableBody: string;
  bookingHeading: string; // {meeting} {brand}
  minutes: string;
  timesIn: string; // {tz}
  noTimes: string;
  change: string;
  labelNotes: string;
  confirm: string;
  confirming: string;
  bookingFootnote: string;
  bookedTitle: string;
  bookedWith: string; // {meeting} {brand}
  bookedFootnote: string;
  networkError: string;
  bookingFailed: string;
  locPhone: string;
  locVideo: string;
  locInPerson: string;
  locDetails: string;

  // Booking confirmation email (to the invitee)
  emailSubject: string; // {meeting} {brand}
  emailGreeting: string; // {name}
  emailBooked: string; // {meeting} {brand}
  emailWhen: string; // {when}
  emailWhere: string; // {where}
  emailChange: string;
  emailAddToCalendar: string;
  reminderSubject: string; // {meeting} {brand}
  reminderBody: string; // {meeting} {brand}
  smsConfirm: string; // {meeting} {brand} {when}
  smsReminder: string; // {meeting} {brand} {when}
  locPhoneLong: string;
  locVideoLong: string;
  locInPersonLong: string;

  // Unsubscribe result pages (shown only after the signed token verified)
  unsubDoneTitle: string;
  unsubDoneBody: string;
  unsubAlreadyTitle: string;
  unsubAlreadyBody: string;
  unsubErrorTitle: string;
  unsubErrorBody: string;
}

const en: ProspectStrings = {
  smsConfirm: "{brand}: your {meeting} is confirmed for {when}.",
  smsReminder: "{brand} reminder: {meeting} on {when}.",
  reminderSubject: "Reminder: {meeting} with {brand}",
  reminderBody: "A quick reminder about your {meeting} with {brand}.",
  emailManage: "Need to cancel or reschedule?",
  cancelHeading: "Cancel this meeting?",
  cancelButton: "Yes, cancel it",
  cancelledTitle: "Meeting cancelled",
  cancelledBody: "Your meeting has been cancelled.",
  cancelRebook: "Book a new time",
  cancelGoneTitle: "Nothing to cancel",
  cancelGoneBody: "This meeting is already cancelled or no longer exists.",
  dir: "ltr",
  formUnavailableTitle: "Form unavailable",
  formUnavailableBody: "This form link is invalid or has expired. Please contact the site owner.",
  formThanksTitle: "Thanks — we'll be in touch",
  formThanksBody: "Your details are in. Someone from {brand} will reach out shortly.",
  formHeading: "Get in touch with {brand}",
  formSub: "Leave your details and we'll reach out.",
  formErrorNameContact: "Please enter your name and an email or phone.",
  labelName: "Name",
  labelEmail: "Email",
  labelPhone: "Phone",
  labelCompany: "Company",
  labelMessage: "Message",
  send: "Send",
  formFootnote: "Provide an email or a phone number so we can reply.",
  bookingUnavailableTitle: "Booking unavailable",
  bookingUnavailableBody: "This booking link is invalid or has expired. Please contact whoever shared it.",
  bookingHeading: "Book a {meeting} with {brand}",
  minutes: "min",
  timesIn: "times shown in {tz}",
  noTimes: "No times are available right now. Please check back soon.",
  change: "change",
  labelNotes: "Anything we should know?",
  confirm: "Confirm booking",
  confirming: "Booking…",
  bookingFootnote: "Provide an email or phone so we can confirm.",
  bookedTitle: "You're booked",
  bookedWith: "{meeting} with {brand}",
  bookedFootnote: "A confirmation is on its way. You can close this window.",
  networkError: "Network error — please try again.",
  bookingFailed: "We couldn't complete that booking. Please try again.",
  locPhone: "Phone call",
  locVideo: "Video call",
  locInPerson: "In person",
  locDetails: "Details to follow",
  emailSubject: "Confirmed: {meeting} with {brand}",
  emailGreeting: "Hi {name},",
  emailBooked: "You're booked for a {meeting} with {brand}.",
  emailWhen: "When: {when}",
  emailWhere: "Where: {where}",
  emailChange: "See you then. Reply to this email if you need to make a change.",
  emailAddToCalendar: "Add to calendar:",
  locPhoneLong: "Phone call — we'll call you.",
  locVideoLong: "Video call — a link will follow.",
  locInPersonLong: "In person.",
  unsubDoneTitle: "You're unsubscribed",
  unsubDoneBody: "Done — you won't hear from us again. Sorry to see you go.",
  unsubAlreadyTitle: "Already removed",
  unsubAlreadyBody: "We couldn't find that contact — you may already be unsubscribed.",
  unsubErrorTitle: "Something went wrong",
  unsubErrorBody: "We couldn't process that right now. Reply with “unsubscribe” and we'll handle it.",
};

const es: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: tu {meeting} está confirmada para {when}.",
  smsReminder: "Recordatorio de {brand}: {meeting} el {when}.",
  reminderSubject: "Recordatorio: {meeting} con {brand}",
  reminderBody: "Un recordatorio rápido sobre tu {meeting} con {brand}.",
  emailManage: "¿Necesitas cancelar o reprogramar?",
  cancelHeading: "¿Cancelar esta reunión?",
  cancelButton: "Sí, cancelar",
  cancelledTitle: "Reunión cancelada",
  cancelledBody: "Tu reunión ha sido cancelada.",
  cancelRebook: "Reservar otro horario",
  cancelGoneTitle: "Nada que cancelar",
  cancelGoneBody: "Esta reunión ya está cancelada o ya no existe.",
  formUnavailableTitle: "Formulario no disponible",
  formUnavailableBody: "Este enlace no es válido o ha caducado. Contacta con el propietario del sitio.",
  formThanksTitle: "Gracias — te contactaremos",
  formThanksBody: "Hemos recibido tus datos. Alguien de {brand} te contactará en breve.",
  formHeading: "Contacta con {brand}",
  formSub: "Déjanos tus datos y te contactaremos.",
  formErrorNameContact: "Introduce tu nombre y un email o teléfono.",
  labelName: "Nombre",
  labelEmail: "Email",
  labelPhone: "Teléfono",
  labelCompany: "Empresa",
  labelMessage: "Mensaje",
  send: "Enviar",
  formFootnote: "Indica un email o un teléfono para poder responderte.",
  bookingUnavailableTitle: "Reserva no disponible",
  bookingUnavailableBody: "Este enlace de reserva no es válido o ha caducado. Contacta con quien te lo compartió.",
  bookingHeading: "Reserva un {meeting} con {brand}",
  minutes: "min",
  timesIn: "horarios en {tz}",
  noTimes: "No hay horarios disponibles ahora mismo. Vuelve a intentarlo pronto.",
  change: "cambiar",
  labelNotes: "¿Algo que debamos saber?",
  confirm: "Confirmar reserva",
  confirming: "Reservando…",
  bookingFootnote: "Indica un email o teléfono para poder confirmar.",
  bookedTitle: "Reserva confirmada",
  bookedWith: "{meeting} con {brand}",
  bookedFootnote: "La confirmación está en camino. Puedes cerrar esta ventana.",
  networkError: "Error de red — inténtalo de nuevo.",
  bookingFailed: "No pudimos completar la reserva. Inténtalo de nuevo.",
  locPhone: "Llamada telefónica",
  locVideo: "Videollamada",
  locInPerson: "En persona",
  locDetails: "Detalles a continuación",
  emailSubject: "Confirmado: {meeting} con {brand}",
  emailGreeting: "Hola {name}:",
  emailBooked: "Tienes una reserva de {meeting} con {brand}.",
  emailWhen: "Cuándo: {when}",
  emailWhere: "Dónde: {where}",
  emailChange: "Nos vemos entonces. Responde a este email si necesitas hacer algún cambio.",
  emailAddToCalendar: "Añadir al calendario:",
  locPhoneLong: "Llamada telefónica — te llamaremos.",
  locVideoLong: "Videollamada — recibirás un enlace.",
  locInPersonLong: "En persona.",
  unsubDoneTitle: "Baja confirmada",
  unsubDoneBody: "Listo — no volverás a saber de nosotros. Sentimos verte ir.",
  unsubAlreadyTitle: "Ya eliminado",
  unsubAlreadyBody: "No encontramos ese contacto — puede que ya estés dado de baja.",
  unsubErrorTitle: "Algo salió mal",
  unsubErrorBody: "No pudimos procesarlo ahora. Responde con “unsubscribe” y lo gestionamos.",
};

const fr: Partial<ProspectStrings> = {
  smsConfirm: "{brand} : votre {meeting} est confirmé pour {when}.",
  smsReminder: "Rappel {brand} : {meeting} le {when}.",
  reminderSubject: "Rappel : {meeting} avec {brand}",
  reminderBody: "Petit rappel concernant votre {meeting} avec {brand}.",
  emailManage: "Besoin d'annuler ou de reprogrammer ?",
  cancelHeading: "Annuler ce rendez-vous ?",
  cancelButton: "Oui, annuler",
  cancelledTitle: "Rendez-vous annulé",
  cancelledBody: "Votre rendez-vous a été annulé.",
  cancelRebook: "Réserver un autre créneau",
  cancelGoneTitle: "Rien à annuler",
  cancelGoneBody: "Ce rendez-vous est déjà annulé ou n'existe plus.",
  formUnavailableTitle: "Formulaire indisponible",
  formUnavailableBody: "Ce lien est invalide ou a expiré. Contactez le propriétaire du site.",
  formThanksTitle: "Merci — nous vous recontactons",
  formThanksBody: "Vos coordonnées sont bien reçues. Quelqu'un de {brand} vous contactera sous peu.",
  formHeading: "Contactez {brand}",
  formSub: "Laissez vos coordonnées et nous vous recontacterons.",
  formErrorNameContact: "Veuillez saisir votre nom et un email ou un téléphone.",
  labelName: "Nom",
  labelEmail: "Email",
  labelPhone: "Téléphone",
  labelCompany: "Société",
  labelMessage: "Message",
  send: "Envoyer",
  formFootnote: "Indiquez un email ou un téléphone pour que nous puissions répondre.",
  bookingUnavailableTitle: "Réservation indisponible",
  bookingUnavailableBody: "Ce lien de réservation est invalide ou a expiré. Contactez la personne qui l'a partagé.",
  bookingHeading: "Réservez un {meeting} avec {brand}",
  minutes: "min",
  timesIn: "horaires en {tz}",
  noTimes: "Aucun créneau disponible pour le moment. Revenez bientôt.",
  change: "modifier",
  labelNotes: "Quelque chose à nous signaler ?",
  confirm: "Confirmer la réservation",
  confirming: "Réservation…",
  bookingFootnote: "Indiquez un email ou un téléphone pour la confirmation.",
  bookedTitle: "C'est réservé",
  bookedWith: "{meeting} avec {brand}",
  bookedFootnote: "La confirmation arrive. Vous pouvez fermer cette fenêtre.",
  networkError: "Erreur réseau — veuillez réessayer.",
  bookingFailed: "Impossible de finaliser la réservation. Veuillez réessayer.",
  locPhone: "Appel téléphonique",
  locVideo: "Visioconférence",
  locInPerson: "En personne",
  locDetails: "Détails à venir",
  emailSubject: "Confirmé : {meeting} avec {brand}",
  emailGreeting: "Bonjour {name},",
  emailBooked: "Votre {meeting} avec {brand} est réservé.",
  emailWhen: "Quand : {when}",
  emailWhere: "Où : {where}",
  emailChange: "À bientôt. Répondez à cet email pour tout changement.",
  emailAddToCalendar: "Ajouter au calendrier :",
  locPhoneLong: "Appel téléphonique — nous vous appellerons.",
  locVideoLong: "Visioconférence — un lien suivra.",
  locInPersonLong: "En personne.",
  unsubDoneTitle: "Désinscription confirmée",
  unsubDoneBody: "C'est fait — vous n'entendrez plus parler de nous.",
  unsubAlreadyTitle: "Déjà supprimé",
  unsubAlreadyBody: "Contact introuvable — vous êtes peut-être déjà désinscrit.",
  unsubErrorTitle: "Une erreur est survenue",
  unsubErrorBody: "Impossible de traiter la demande. Répondez « unsubscribe » et nous nous en occupons.",
};

const de: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: Ihr {meeting} ist für {when} bestätigt.",
  smsReminder: "{brand} Erinnerung: {meeting} am {when}.",
  reminderSubject: "Erinnerung: {meeting} mit {brand}",
  reminderBody: "Eine kurze Erinnerung an Ihren {meeting} mit {brand}.",
  emailManage: "Absagen oder verschieben?",
  cancelHeading: "Diesen Termin absagen?",
  cancelButton: "Ja, absagen",
  cancelledTitle: "Termin abgesagt",
  cancelledBody: "Ihr Termin wurde abgesagt.",
  cancelRebook: "Neuen Termin buchen",
  cancelGoneTitle: "Nichts abzusagen",
  cancelGoneBody: "Dieser Termin ist bereits abgesagt oder existiert nicht mehr.",
  formUnavailableTitle: "Formular nicht verfügbar",
  formUnavailableBody: "Dieser Link ist ungültig oder abgelaufen. Bitte wenden Sie sich an den Seitenbetreiber.",
  formThanksTitle: "Danke — wir melden uns",
  formThanksBody: "Ihre Daten sind angekommen. Jemand von {brand} meldet sich in Kürze.",
  formHeading: "Kontakt zu {brand}",
  formSub: "Hinterlassen Sie Ihre Daten — wir melden uns.",
  formErrorNameContact: "Bitte Namen und E-Mail oder Telefon angeben.",
  labelName: "Name",
  labelEmail: "E-Mail",
  labelPhone: "Telefon",
  labelCompany: "Firma",
  labelMessage: "Nachricht",
  send: "Senden",
  formFootnote: "Geben Sie E-Mail oder Telefon an, damit wir antworten können.",
  bookingUnavailableTitle: "Buchung nicht verfügbar",
  bookingUnavailableBody: "Dieser Buchungslink ist ungültig oder abgelaufen. Bitte wenden Sie sich an den Absender.",
  bookingHeading: "{meeting} mit {brand} buchen",
  minutes: "Min.",
  timesIn: "Zeiten in {tz}",
  noTimes: "Derzeit sind keine Termine verfügbar. Bitte schauen Sie bald wieder vorbei.",
  change: "ändern",
  labelNotes: "Gibt es etwas, das wir wissen sollten?",
  confirm: "Buchung bestätigen",
  confirming: "Wird gebucht…",
  bookingFootnote: "Geben Sie E-Mail oder Telefon für die Bestätigung an.",
  bookedTitle: "Gebucht!",
  bookedWith: "{meeting} mit {brand}",
  bookedFootnote: "Die Bestätigung ist unterwegs. Sie können dieses Fenster schließen.",
  networkError: "Netzwerkfehler — bitte erneut versuchen.",
  bookingFailed: "Die Buchung konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
  locPhone: "Telefonat",
  locVideo: "Videoanruf",
  locInPerson: "Vor Ort",
  locDetails: "Details folgen",
  emailSubject: "Bestätigt: {meeting} mit {brand}",
  emailGreeting: "Hallo {name},",
  emailBooked: "Ihr {meeting} mit {brand} ist gebucht.",
  emailWhen: "Wann: {when}",
  emailWhere: "Wo: {where}",
  emailChange: "Bis dann! Antworten Sie auf diese E-Mail, falls sich etwas ändert.",
  emailAddToCalendar: "Zum Kalender hinzufügen:",
  locPhoneLong: "Telefonat — wir rufen Sie an.",
  locVideoLong: "Videoanruf — ein Link folgt.",
  locInPersonLong: "Vor Ort.",
  unsubDoneTitle: "Abgemeldet",
  unsubDoneBody: "Erledigt — Sie hören nichts mehr von uns. Schade, dass Sie gehen.",
  unsubAlreadyTitle: "Bereits entfernt",
  unsubAlreadyBody: "Kontakt nicht gefunden — Sie sind vermutlich bereits abgemeldet.",
  unsubErrorTitle: "Etwas ist schiefgelaufen",
  unsubErrorBody: "Das hat gerade nicht geklappt. Antworten Sie mit „unsubscribe“, wir kümmern uns darum.",
};

const pt: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: seu {meeting} está confirmado para {when}.",
  smsReminder: "Lembrete {brand}: {meeting} em {when}.",
  reminderSubject: "Lembrete: {meeting} com {brand}",
  reminderBody: "Um lembrete rápido sobre o seu {meeting} com {brand}.",
  emailManage: "Precisa cancelar ou remarcar?",
  cancelHeading: "Cancelar esta reunião?",
  cancelButton: "Sim, cancelar",
  cancelledTitle: "Reunião cancelada",
  cancelledBody: "Sua reunião foi cancelada.",
  cancelRebook: "Agendar outro horário",
  cancelGoneTitle: "Nada para cancelar",
  cancelGoneBody: "Esta reunião já foi cancelada ou não existe mais.",
  formUnavailableTitle: "Formulário indisponível",
  formUnavailableBody: "Este link é inválido ou expirou. Contate o responsável pelo site.",
  formThanksTitle: "Obrigado — entraremos em contato",
  formThanksBody: "Recebemos seus dados. Alguém da {brand} entrará em contato em breve.",
  formHeading: "Fale com a {brand}",
  formSub: "Deixe seus dados e entraremos em contato.",
  formErrorNameContact: "Informe seu nome e um e-mail ou telefone.",
  labelName: "Nome",
  labelEmail: "E-mail",
  labelPhone: "Telefone",
  labelCompany: "Empresa",
  labelMessage: "Mensagem",
  send: "Enviar",
  formFootnote: "Informe um e-mail ou telefone para podermos responder.",
  bookingUnavailableTitle: "Agendamento indisponível",
  bookingUnavailableBody: "Este link de agendamento é inválido ou expirou. Contate quem o compartilhou.",
  bookingHeading: "Agende um {meeting} com a {brand}",
  minutes: "min",
  timesIn: "horários em {tz}",
  noTimes: "Não há horários disponíveis no momento. Volte em breve.",
  change: "alterar",
  labelNotes: "Algo que devemos saber?",
  confirm: "Confirmar agendamento",
  confirming: "Agendando…",
  bookingFootnote: "Informe um e-mail ou telefone para confirmarmos.",
  bookedTitle: "Agendado!",
  bookedWith: "{meeting} com a {brand}",
  bookedFootnote: "A confirmação está a caminho. Pode fechar esta janela.",
  networkError: "Erro de rede — tente novamente.",
  bookingFailed: "Não foi possível concluir o agendamento. Tente novamente.",
  locPhone: "Ligação telefônica",
  locVideo: "Videochamada",
  locInPerson: "Presencial",
  locDetails: "Detalhes em breve",
  emailSubject: "Confirmado: {meeting} com a {brand}",
  emailGreeting: "Olá, {name}!",
  emailBooked: "Seu {meeting} com a {brand} está agendado.",
  emailWhen: "Quando: {when}",
  emailWhere: "Onde: {where}",
  emailChange: "Até lá! Responda a este e-mail se precisar alterar algo.",
  emailAddToCalendar: "Adicionar ao calendário:",
  locPhoneLong: "Ligação telefônica — nós ligamos para você.",
  locVideoLong: "Videochamada — enviaremos um link.",
  locInPersonLong: "Presencial.",
  unsubDoneTitle: "Inscrição cancelada",
  unsubDoneBody: "Pronto — você não receberá mais nada de nós.",
  unsubAlreadyTitle: "Já removido",
  unsubAlreadyBody: "Não encontramos esse contato — talvez você já esteja descadastrado.",
  unsubErrorTitle: "Algo deu errado",
  unsubErrorBody: "Não conseguimos processar agora. Responda “unsubscribe” e cuidaremos disso.",
};

const it: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: il tuo {meeting} è confermato per {when}.",
  smsReminder: "Promemoria {brand}: {meeting} il {when}.",
  reminderSubject: "Promemoria: {meeting} con {brand}",
  reminderBody: "Un breve promemoria per il tuo {meeting} con {brand}.",
  emailManage: "Devi annullare o riprogrammare?",
  cancelHeading: "Annullare questo incontro?",
  cancelButton: "Sì, annulla",
  cancelledTitle: "Incontro annullato",
  cancelledBody: "Il tuo incontro è stato annullato.",
  cancelRebook: "Prenota un altro orario",
  cancelGoneTitle: "Niente da annullare",
  cancelGoneBody: "Questo incontro è già annullato o non esiste più.",
  formUnavailableTitle: "Modulo non disponibile",
  formUnavailableBody: "Questo link non è valido o è scaduto. Contatta il proprietario del sito.",
  formThanksTitle: "Grazie — ti contatteremo",
  formThanksBody: "Abbiamo ricevuto i tuoi dati. Qualcuno di {brand} ti contatterà a breve.",
  formHeading: "Contatta {brand}",
  formSub: "Lascia i tuoi dati e ti contatteremo.",
  formErrorNameContact: "Inserisci il tuo nome e un'email o un telefono.",
  labelName: "Nome",
  labelEmail: "Email",
  labelPhone: "Telefono",
  labelCompany: "Azienda",
  labelMessage: "Messaggio",
  send: "Invia",
  formFootnote: "Indica un'email o un telefono così possiamo risponderti.",
  bookingUnavailableTitle: "Prenotazione non disponibile",
  bookingUnavailableBody: "Questo link di prenotazione non è valido o è scaduto. Contatta chi te l'ha condiviso.",
  bookingHeading: "Prenota un {meeting} con {brand}",
  minutes: "min",
  timesIn: "orari in {tz}",
  noTimes: "Al momento non ci sono orari disponibili. Riprova presto.",
  change: "cambia",
  labelNotes: "Qualcosa che dovremmo sapere?",
  confirm: "Conferma prenotazione",
  confirming: "Prenotazione…",
  bookingFootnote: "Indica un'email o un telefono per la conferma.",
  bookedTitle: "Prenotato!",
  bookedWith: "{meeting} con {brand}",
  bookedFootnote: "La conferma è in arrivo. Puoi chiudere questa finestra.",
  networkError: "Errore di rete — riprova.",
  bookingFailed: "Non siamo riusciti a completare la prenotazione. Riprova.",
  locPhone: "Telefonata",
  locVideo: "Videochiamata",
  locInPerson: "Di persona",
  locDetails: "Dettagli a seguire",
  emailSubject: "Confermato: {meeting} con {brand}",
  emailGreeting: "Ciao {name},",
  emailBooked: "Il tuo {meeting} con {brand} è prenotato.",
  emailWhen: "Quando: {when}",
  emailWhere: "Dove: {where}",
  emailChange: "A presto! Rispondi a questa email per qualsiasi modifica.",
  emailAddToCalendar: "Aggiungi al calendario:",
  locPhoneLong: "Telefonata — ti chiameremo noi.",
  locVideoLong: "Videochiamata — riceverai un link.",
  locInPersonLong: "Di persona.",
  unsubDoneTitle: "Disiscrizione completata",
  unsubDoneBody: "Fatto — non ci sentirai più. Ci dispiace vederti andare.",
  unsubAlreadyTitle: "Già rimosso",
  unsubAlreadyBody: "Contatto non trovato — forse sei già disiscritto.",
  unsubErrorTitle: "Qualcosa è andato storto",
  unsubErrorBody: "Non siamo riusciti a procedere. Rispondi “unsubscribe” e ce ne occupiamo noi.",
};

const nl: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: je {meeting} is bevestigd voor {when}.",
  smsReminder: "{brand} herinnering: {meeting} op {when}.",
  reminderSubject: "Herinnering: {meeting} met {brand}",
  reminderBody: "Een korte herinnering aan je {meeting} met {brand}.",
  emailManage: "Annuleren of verzetten?",
  cancelHeading: "Deze afspraak annuleren?",
  cancelButton: "Ja, annuleren",
  cancelledTitle: "Afspraak geannuleerd",
  cancelledBody: "Je afspraak is geannuleerd.",
  cancelRebook: "Een nieuwe tijd boeken",
  cancelGoneTitle: "Niets te annuleren",
  cancelGoneBody: "Deze afspraak is al geannuleerd of bestaat niet meer.",
  formUnavailableTitle: "Formulier niet beschikbaar",
  formUnavailableBody: "Deze link is ongeldig of verlopen. Neem contact op met de site-eigenaar.",
  formThanksTitle: "Bedankt — we nemen contact op",
  formThanksBody: "Je gegevens zijn ontvangen. Iemand van {brand} neemt snel contact op.",
  formHeading: "Neem contact op met {brand}",
  formSub: "Laat je gegevens achter en we nemen contact op.",
  formErrorNameContact: "Vul je naam en een e-mailadres of telefoonnummer in.",
  labelName: "Naam",
  labelEmail: "E-mail",
  labelPhone: "Telefoon",
  labelCompany: "Bedrijf",
  labelMessage: "Bericht",
  send: "Versturen",
  formFootnote: "Geef een e-mailadres of telefoonnummer op zodat we kunnen reageren.",
  bookingUnavailableTitle: "Boeking niet beschikbaar",
  bookingUnavailableBody: "Deze boekingslink is ongeldig of verlopen. Neem contact op met degene die hem deelde.",
  bookingHeading: "Boek een {meeting} met {brand}",
  minutes: "min",
  timesIn: "tijden in {tz}",
  noTimes: "Er zijn momenteel geen tijden beschikbaar. Kom snel terug.",
  change: "wijzigen",
  labelNotes: "Iets dat we moeten weten?",
  confirm: "Boeking bevestigen",
  confirming: "Bezig met boeken…",
  bookingFootnote: "Geef een e-mailadres of telefoonnummer op voor de bevestiging.",
  bookedTitle: "Geboekt!",
  bookedWith: "{meeting} met {brand}",
  bookedFootnote: "De bevestiging is onderweg. Je kunt dit venster sluiten.",
  networkError: "Netwerkfout — probeer het opnieuw.",
  bookingFailed: "We konden de boeking niet afronden. Probeer het opnieuw.",
  locPhone: "Telefoongesprek",
  locVideo: "Videogesprek",
  locInPerson: "Op locatie",
  locDetails: "Details volgen",
  emailSubject: "Bevestigd: {meeting} met {brand}",
  emailGreeting: "Hoi {name},",
  emailBooked: "Je {meeting} met {brand} is geboekt.",
  emailWhen: "Wanneer: {when}",
  emailWhere: "Waar: {where}",
  emailChange: "Tot dan! Beantwoord deze e-mail als er iets wijzigt.",
  emailAddToCalendar: "Toevoegen aan agenda:",
  locPhoneLong: "Telefoongesprek — wij bellen jou.",
  locVideoLong: "Videogesprek — je ontvangt een link.",
  locInPersonLong: "Op locatie.",
  unsubDoneTitle: "Uitgeschreven",
  unsubDoneBody: "Klaar — je hoort niets meer van ons. Jammer dat je gaat.",
  unsubAlreadyTitle: "Al verwijderd",
  unsubAlreadyBody: "Contact niet gevonden — mogelijk ben je al uitgeschreven.",
  unsubErrorTitle: "Er ging iets mis",
  unsubErrorBody: "We konden dit nu niet verwerken. Antwoord met “unsubscribe” en wij regelen het.",
};

const pl: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: Twój {meeting} potwierdzony na {when}.",
  smsReminder: "Przypomnienie {brand}: {meeting} dnia {when}.",
  reminderSubject: "Przypomnienie: {meeting} z {brand}",
  reminderBody: "Krótkie przypomnienie o Twoim spotkaniu ({meeting}) z {brand}.",
  emailManage: "Chcesz odwołać lub zmienić termin?",
  cancelHeading: "Odwołać to spotkanie?",
  cancelButton: "Tak, odwołaj",
  cancelledTitle: "Spotkanie odwołane",
  cancelledBody: "Twoje spotkanie zostało odwołane.",
  cancelRebook: "Zarezerwuj nowy termin",
  cancelGoneTitle: "Nie ma czego odwoływać",
  cancelGoneBody: "To spotkanie zostało już odwołane lub nie istnieje.",
  formUnavailableTitle: "Formularz niedostępny",
  formUnavailableBody: "Ten link jest nieprawidłowy lub wygasł. Skontaktuj się z właścicielem strony.",
  formThanksTitle: "Dziękujemy — odezwiemy się",
  formThanksBody: "Mamy Twoje dane. Ktoś z {brand} wkrótce się odezwie.",
  formHeading: "Skontaktuj się z {brand}",
  formSub: "Zostaw swoje dane, a my się odezwiemy.",
  formErrorNameContact: "Podaj imię i nazwisko oraz e-mail lub telefon.",
  labelName: "Imię i nazwisko",
  labelEmail: "E-mail",
  labelPhone: "Telefon",
  labelCompany: "Firma",
  labelMessage: "Wiadomość",
  send: "Wyślij",
  formFootnote: "Podaj e-mail lub telefon, abyśmy mogli odpowiedzieć.",
  bookingUnavailableTitle: "Rezerwacja niedostępna",
  bookingUnavailableBody: "Ten link do rezerwacji jest nieprawidłowy lub wygasł. Skontaktuj się z osobą, która go udostępniła.",
  bookingHeading: "Zarezerwuj {meeting} z {brand}",
  minutes: "min",
  timesIn: "czasy w {tz}",
  noTimes: "Brak dostępnych terminów. Sprawdź ponownie wkrótce.",
  change: "zmień",
  labelNotes: "Coś, o czym powinniśmy wiedzieć?",
  confirm: "Potwierdź rezerwację",
  confirming: "Rezerwowanie…",
  bookingFootnote: "Podaj e-mail lub telefon do potwierdzenia.",
  bookedTitle: "Zarezerwowano!",
  bookedWith: "{meeting} z {brand}",
  bookedFootnote: "Potwierdzenie jest w drodze. Możesz zamknąć to okno.",
  networkError: "Błąd sieci — spróbuj ponownie.",
  bookingFailed: "Nie udało się dokończyć rezerwacji. Spróbuj ponownie.",
  locPhone: "Rozmowa telefoniczna",
  locVideo: "Wideorozmowa",
  locInPerson: "Osobiście",
  locDetails: "Szczegóły wkrótce",
  emailSubject: "Potwierdzono: {meeting} z {brand}",
  emailGreeting: "Cześć {name},",
  emailBooked: "Twoje spotkanie ({meeting}) z {brand} jest zarezerwowane.",
  emailWhen: "Kiedy: {when}",
  emailWhere: "Gdzie: {where}",
  emailChange: "Do zobaczenia! Odpowiedz na tę wiadomość, jeśli coś się zmieni.",
  emailAddToCalendar: "Dodaj do kalendarza:",
  locPhoneLong: "Rozmowa telefoniczna — zadzwonimy do Ciebie.",
  locVideoLong: "Wideorozmowa — link wkrótce.",
  locInPersonLong: "Osobiście.",
  unsubDoneTitle: "Wypisano",
  unsubDoneBody: "Gotowe — nie będziemy się już kontaktować.",
  unsubAlreadyTitle: "Już usunięto",
  unsubAlreadyBody: "Nie znaleziono kontaktu — możliwe, że już się wypisałeś.",
  unsubErrorTitle: "Coś poszło nie tak",
  unsubErrorBody: "Nie udało się teraz tego przetworzyć. Odpowiedz „unsubscribe”, a zajmiemy się tym.",
};

const ja: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: {meeting}が{when}に確定しました。",
  smsReminder: "{brand}リマインダー: {meeting} {when}。",
  reminderSubject: "リマインダー: {brand}との{meeting}",
  reminderBody: "{brand}との{meeting}についてのリマインダーです。",
  emailManage: "キャンセルまたは再予約が必要ですか？",
  cancelHeading: "この打ち合わせをキャンセルしますか？",
  cancelButton: "はい、キャンセルする",
  cancelledTitle: "打ち合わせをキャンセルしました",
  cancelledBody: "ご予約をキャンセルしました。",
  cancelRebook: "別の時間を予約する",
  cancelGoneTitle: "キャンセルする予約はありません",
  cancelGoneBody: "この打ち合わせはすでにキャンセルされたか、存在しません。",
  formUnavailableTitle: "フォームは利用できません",
  formUnavailableBody: "このリンクは無効か期限切れです。サイト管理者にお問い合わせください。",
  formThanksTitle: "ありがとうございます — 追ってご連絡します",
  formThanksBody: "内容を受け付けました。{brand}の担当者よりまもなくご連絡いたします。",
  formHeading: "{brand}へのお問い合わせ",
  formSub: "ご連絡先をご記入ください。担当者よりご連絡いたします。",
  formErrorNameContact: "お名前と、メールまたは電話番号をご入力ください。",
  labelName: "お名前",
  labelEmail: "メール",
  labelPhone: "電話番号",
  labelCompany: "会社名",
  labelMessage: "メッセージ",
  send: "送信",
  formFootnote: "ご返信のため、メールまたは電話番号をご記入ください。",
  bookingUnavailableTitle: "予約は利用できません",
  bookingUnavailableBody: "この予約リンクは無効か期限切れです。リンクの送信者にお問い合わせください。",
  bookingHeading: "{brand}との{meeting}を予約",
  minutes: "分",
  timesIn: "表示時間帯: {tz}",
  noTimes: "現在予約可能な時間がありません。後ほどご確認ください。",
  change: "変更",
  labelNotes: "事前にお知らせいただくことはありますか？",
  confirm: "予約を確定",
  confirming: "予約中…",
  bookingFootnote: "確認のため、メールまたは電話番号をご記入ください。",
  bookedTitle: "予約が完了しました",
  bookedWith: "{brand}との{meeting}",
  bookedFootnote: "確認のご連絡をお送りします。このウィンドウは閉じて構いません。",
  networkError: "ネットワークエラー — もう一度お試しください。",
  bookingFailed: "予約を完了できませんでした。もう一度お試しください。",
  locPhone: "電話",
  locVideo: "ビデオ通話",
  locInPerson: "対面",
  locDetails: "詳細は追って",
  emailSubject: "確定: {brand}との{meeting}",
  emailGreeting: "{name} 様",
  emailBooked: "{brand}との{meeting}のご予約が確定しました。",
  emailWhen: "日時: {when}",
  emailWhere: "場所: {where}",
  emailChange: "当日お会いできるのを楽しみにしております。変更がある場合はこのメールにご返信ください。",
  emailAddToCalendar: "カレンダーに追加:",
  locPhoneLong: "お電話 — こちらからおかけします。",
  locVideoLong: "ビデオ通話 — リンクを追ってお送りします。",
  locInPersonLong: "対面。",
  unsubDoneTitle: "配信停止しました",
  unsubDoneBody: "完了しました。今後ご連絡することはありません。",
  unsubAlreadyTitle: "既に削除済み",
  unsubAlreadyBody: "該当の連絡先が見つかりません。既に配信停止済みの可能性があります。",
  unsubErrorTitle: "問題が発生しました",
  unsubErrorBody: "処理できませんでした。「unsubscribe」と返信いただければ対応します。",
};

const zh: Partial<ProspectStrings> = {
  smsConfirm: "{brand}：您的{meeting}已确认，时间为{when}。",
  smsReminder: "{brand}提醒：{meeting}，{when}。",
  reminderSubject: "提醒：与{brand}的{meeting}",
  reminderBody: "温馨提醒您与{brand}的{meeting}。",
  emailManage: "需要取消或改期吗？",
  cancelHeading: "取消此次会议？",
  cancelButton: "是的，取消",
  cancelledTitle: "会议已取消",
  cancelledBody: "您的会议已取消。",
  cancelRebook: "预约其他时间",
  cancelGoneTitle: "没有可取消的会议",
  cancelGoneBody: "此会议已取消或不存在。",
  formUnavailableTitle: "表单不可用",
  formUnavailableBody: "此链接无效或已过期。请联系网站所有者。",
  formThanksTitle: "感谢您 — 我们会尽快联系您",
  formThanksBody: "已收到您的信息。{brand}的工作人员将尽快与您联系。",
  formHeading: "联系{brand}",
  formSub: "留下您的联系方式，我们会尽快联系您。",
  formErrorNameContact: "请填写您的姓名以及邮箱或电话。",
  labelName: "姓名",
  labelEmail: "邮箱",
  labelPhone: "电话",
  labelCompany: "公司",
  labelMessage: "留言",
  send: "发送",
  formFootnote: "请提供邮箱或电话，以便我们回复您。",
  bookingUnavailableTitle: "预约不可用",
  bookingUnavailableBody: "此预约链接无效或已过期。请联系分享者。",
  bookingHeading: "预约与{brand}的{meeting}",
  minutes: "分钟",
  timesIn: "时间以{tz}显示",
  noTimes: "当前没有可预约的时间，请稍后再试。",
  change: "更改",
  labelNotes: "有什么需要我们提前了解的吗？",
  confirm: "确认预约",
  confirming: "预约中…",
  bookingFootnote: "请提供邮箱或电话以便确认。",
  bookedTitle: "预约成功",
  bookedWith: "与{brand}的{meeting}",
  bookedFootnote: "确认信息正在发送中，您可以关闭此窗口。",
  networkError: "网络错误 — 请重试。",
  bookingFailed: "预约未能完成，请重试。",
  locPhone: "电话",
  locVideo: "视频会议",
  locInPerson: "线下见面",
  locDetails: "详情待定",
  emailSubject: "已确认：与{brand}的{meeting}",
  emailGreeting: "{name}，您好：",
  emailBooked: "您与{brand}的{meeting}已预约成功。",
  emailWhen: "时间：{when}",
  emailWhere: "地点：{where}",
  emailChange: "期待与您见面。如需更改，请直接回复此邮件。",
  emailAddToCalendar: "添加到日历：",
  locPhoneLong: "电话 — 我们会致电您。",
  locVideoLong: "视频会议 — 稍后发送链接。",
  locInPersonLong: "线下见面。",
  unsubDoneTitle: "已退订",
  unsubDoneBody: "完成 — 您不会再收到我们的消息。",
  unsubAlreadyTitle: "已移除",
  unsubAlreadyBody: "未找到该联系人 — 您可能已退订。",
  unsubErrorTitle: "出了点问题",
  unsubErrorBody: "暂时无法处理。请回复“unsubscribe”，我们会为您处理。",
};

const ko: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: {meeting}이(가) {when}으로 확정되었습니다.",
  smsReminder: "{brand} 리마인더: {meeting} {when}.",
  reminderSubject: "리마인더: {brand}와(과)의 {meeting}",
  reminderBody: "{brand}와(과)의 {meeting} 일정을 다시 안내드립니다.",
  emailManage: "취소 또는 일정 변경이 필요하신가요?",
  cancelHeading: "이 미팅을 취소하시겠어요?",
  cancelButton: "네, 취소합니다",
  cancelledTitle: "미팅이 취소되었습니다",
  cancelledBody: "미팅이 취소되었습니다.",
  cancelRebook: "다른 시간 예약하기",
  cancelGoneTitle: "취소할 항목이 없습니다",
  cancelGoneBody: "이 미팅은 이미 취소되었거나 존재하지 않습니다.",
  formUnavailableTitle: "양식을 사용할 수 없습니다",
  formUnavailableBody: "이 링크는 유효하지 않거나 만료되었습니다. 사이트 운영자에게 문의하세요.",
  formThanksTitle: "감사합니다 — 곧 연락드리겠습니다",
  formThanksBody: "정보가 접수되었습니다. {brand}에서 곧 연락드립니다.",
  formHeading: "{brand}에 문의하기",
  formSub: "연락처를 남겨주시면 연락드리겠습니다.",
  formErrorNameContact: "이름과 이메일 또는 전화번호를 입력해 주세요.",
  labelName: "이름",
  labelEmail: "이메일",
  labelPhone: "전화번호",
  labelCompany: "회사",
  labelMessage: "메시지",
  send: "보내기",
  formFootnote: "답변을 위해 이메일 또는 전화번호를 알려주세요.",
  bookingUnavailableTitle: "예약을 사용할 수 없습니다",
  bookingUnavailableBody: "이 예약 링크는 유효하지 않거나 만료되었습니다. 링크를 공유한 분에게 문의하세요.",
  bookingHeading: "{brand}와(과)의 {meeting} 예약",
  minutes: "분",
  timesIn: "{tz} 기준 시간",
  noTimes: "현재 예약 가능한 시간이 없습니다. 잠시 후 다시 확인해 주세요.",
  change: "변경",
  labelNotes: "미리 알려주실 내용이 있나요?",
  confirm: "예약 확정",
  confirming: "예약 중…",
  bookingFootnote: "확인을 위해 이메일 또는 전화번호를 알려주세요.",
  bookedTitle: "예약이 완료되었습니다",
  bookedWith: "{brand}와(과)의 {meeting}",
  bookedFootnote: "확인 메일이 발송됩니다. 이 창을 닫으셔도 됩니다.",
  networkError: "네트워크 오류 — 다시 시도해 주세요.",
  bookingFailed: "예약을 완료하지 못했습니다. 다시 시도해 주세요.",
  locPhone: "전화",
  locVideo: "화상 통화",
  locInPerson: "대면",
  locDetails: "추후 안내",
  emailSubject: "확정: {brand}와(과)의 {meeting}",
  emailGreeting: "{name}님, 안녕하세요.",
  emailBooked: "{brand}와(과)의 {meeting} 예약이 확정되었습니다.",
  emailWhen: "일시: {when}",
  emailWhere: "장소: {where}",
  emailChange: "그때 뵙겠습니다. 변경이 필요하시면 이 메일에 회신해 주세요.",
  emailAddToCalendar: "캘린더에 추가:",
  locPhoneLong: "전화 — 저희가 전화드립니다.",
  locVideoLong: "화상 통화 — 링크를 보내드립니다.",
  locInPersonLong: "대면.",
  unsubDoneTitle: "수신 거부 완료",
  unsubDoneBody: "완료되었습니다 — 더 이상 연락드리지 않습니다.",
  unsubAlreadyTitle: "이미 삭제됨",
  unsubAlreadyBody: "해당 연락처를 찾을 수 없습니다 — 이미 수신 거부되었을 수 있습니다.",
  unsubErrorTitle: "문제가 발생했습니다",
  unsubErrorBody: "지금은 처리할 수 없습니다. “unsubscribe”라고 회신해 주시면 처리해 드리겠습니다.",
};

const ar: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: تم تأكيد {meeting} في {when}.",
  smsReminder: "تذكير {brand}: {meeting} في {when}.",
  reminderSubject: "تذكير: {meeting} مع {brand}",
  reminderBody: "تذكير سريع بشأن {meeting} مع {brand}.",
  emailManage: "هل تحتاج إلى الإلغاء أو إعادة الجدولة؟",
  cancelHeading: "إلغاء هذا الاجتماع؟",
  cancelButton: "نعم، ألغِه",
  cancelledTitle: "تم إلغاء الاجتماع",
  cancelledBody: "تم إلغاء اجتماعك.",
  cancelRebook: "احجز موعدًا جديدًا",
  cancelGoneTitle: "لا شيء لإلغائه",
  cancelGoneBody: "هذا الاجتماع ملغى بالفعل أو لم يعد موجودًا.",
  dir: "rtl",
  formUnavailableTitle: "النموذج غير متاح",
  formUnavailableBody: "هذا الرابط غير صالح أو منتهي الصلاحية. يرجى التواصل مع مالك الموقع.",
  formThanksTitle: "شكرًا لك — سنتواصل معك",
  formThanksBody: "وصلتنا بياناتك. سيتواصل معك أحد من {brand} قريبًا.",
  formHeading: "تواصل مع {brand}",
  formSub: "اترك بياناتك وسنتواصل معك.",
  formErrorNameContact: "يرجى إدخال اسمك وبريدك الإلكتروني أو رقم هاتفك.",
  labelName: "الاسم",
  labelEmail: "البريد الإلكتروني",
  labelPhone: "الهاتف",
  labelCompany: "الشركة",
  labelMessage: "الرسالة",
  send: "إرسال",
  formFootnote: "يرجى إدخال بريد إلكتروني أو رقم هاتف حتى نتمكن من الرد.",
  bookingUnavailableTitle: "الحجز غير متاح",
  bookingUnavailableBody: "رابط الحجز هذا غير صالح أو منتهي الصلاحية. يرجى التواصل مع من شاركه معك.",
  bookingHeading: "احجز {meeting} مع {brand}",
  minutes: "دقيقة",
  timesIn: "الأوقات بتوقيت {tz}",
  noTimes: "لا توجد أوقات متاحة حاليًا. يرجى المحاولة لاحقًا.",
  change: "تغيير",
  labelNotes: "هل هناك ما يجب أن نعرفه؟",
  confirm: "تأكيد الحجز",
  confirming: "جارٍ الحجز…",
  bookingFootnote: "يرجى إدخال بريد إلكتروني أو هاتف للتأكيد.",
  bookedTitle: "تم الحجز",
  bookedWith: "{meeting} مع {brand}",
  bookedFootnote: "رسالة التأكيد في الطريق. يمكنك إغلاق هذه النافذة.",
  networkError: "خطأ في الشبكة — يرجى المحاولة مرة أخرى.",
  bookingFailed: "تعذّر إتمام الحجز. يرجى المحاولة مرة أخرى.",
  locPhone: "مكالمة هاتفية",
  locVideo: "مكالمة فيديو",
  locInPerson: "حضوريًا",
  locDetails: "التفاصيل لاحقًا",
  emailSubject: "تأكيد: {meeting} مع {brand}",
  emailGreeting: "مرحبًا {name}،",
  emailBooked: "تم حجز {meeting} مع {brand}.",
  emailWhen: "الموعد: {when}",
  emailWhere: "المكان: {where}",
  emailChange: "نراك حينها. يرجى الرد على هذه الرسالة لأي تعديل.",
  emailAddToCalendar: "أضِف إلى التقويم:",
  locPhoneLong: "مكالمة هاتفية — سنتصل بك.",
  locVideoLong: "مكالمة فيديو — سيصلك الرابط.",
  locInPersonLong: "حضوريًا.",
  unsubDoneTitle: "تم إلغاء الاشتراك",
  unsubDoneBody: "تم — لن تسمع منا مجددًا.",
  unsubAlreadyTitle: "تمت الإزالة مسبقًا",
  unsubAlreadyBody: "لم نعثر على جهة الاتصال — ربما ألغيت اشتراكك بالفعل.",
  unsubErrorTitle: "حدث خطأ ما",
  unsubErrorBody: "تعذّرت المعالجة الآن. أرسل ردًا بكلمة “unsubscribe” وسنتولى الأمر.",
};

const hi: Partial<ProspectStrings> = {
  smsConfirm: "{brand}: आपका {meeting} {when} के लिए पुष्टि हुआ।",
  smsReminder: "{brand} रिमाइंडर: {meeting} {when}।",
  reminderSubject: "रिमाइंडर: {brand} के साथ {meeting}",
  reminderBody: "{brand} के साथ आपकी {meeting} की एक त्वरित याद।",
  emailManage: "रद्द या पुनर्निर्धारित करना है?",
  cancelHeading: "क्या यह मीटिंग रद्द करें?",
  cancelButton: "हाँ, रद्द करें",
  cancelledTitle: "मीटिंग रद्द कर दी गई",
  cancelledBody: "आपकी मीटिंग रद्द कर दी गई है।",
  cancelRebook: "नया समय बुक करें",
  cancelGoneTitle: "रद्द करने के लिए कुछ नहीं",
  cancelGoneBody: "यह मीटिंग पहले ही रद्द हो चुकी है या अब मौजूद नहीं है।",
  formUnavailableTitle: "फ़ॉर्म उपलब्ध नहीं है",
  formUnavailableBody: "यह लिंक अमान्य है या समाप्त हो गया है। कृपया साइट के मालिक से संपर्क करें।",
  formThanksTitle: "धन्यवाद — हम संपर्क करेंगे",
  formThanksBody: "आपकी जानकारी मिल गई है। {brand} से कोई जल्द ही संपर्क करेगा।",
  formHeading: "{brand} से संपर्क करें",
  formSub: "अपनी जानकारी दें, हम संपर्क करेंगे।",
  formErrorNameContact: "कृपया अपना नाम और ईमेल या फ़ोन दर्ज करें।",
  labelName: "नाम",
  labelEmail: "ईमेल",
  labelPhone: "फ़ोन",
  labelCompany: "कंपनी",
  labelMessage: "संदेश",
  send: "भेजें",
  formFootnote: "जवाब देने के लिए ईमेल या फ़ोन नंबर दें।",
  bookingUnavailableTitle: "बुकिंग उपलब्ध नहीं है",
  bookingUnavailableBody: "यह बुकिंग लिंक अमान्य है या समाप्त हो गया है। जिसने साझा किया उनसे संपर्क करें।",
  bookingHeading: "{brand} के साथ {meeting} बुक करें",
  minutes: "मिनट",
  timesIn: "समय {tz} में",
  noTimes: "अभी कोई समय उपलब्ध नहीं है। कृपया बाद में देखें।",
  change: "बदलें",
  labelNotes: "कुछ ऐसा जो हमें पता होना चाहिए?",
  confirm: "बुकिंग पक्की करें",
  confirming: "बुक हो रहा है…",
  bookingFootnote: "पुष्टि के लिए ईमेल या फ़ोन दें।",
  bookedTitle: "बुकिंग हो गई",
  bookedWith: "{brand} के साथ {meeting}",
  bookedFootnote: "पुष्टि भेजी जा रही है। आप यह विंडो बंद कर सकते हैं।",
  networkError: "नेटवर्क त्रुटि — फिर से कोशिश करें।",
  bookingFailed: "बुकिंग पूरी नहीं हो सकी। फिर से कोशिश करें।",
  locPhone: "फ़ोन कॉल",
  locVideo: "वीडियो कॉल",
  locInPerson: "आमने-सामने",
  locDetails: "विवरण बाद में",
  emailSubject: "पक्का: {brand} के साथ {meeting}",
  emailGreeting: "नमस्ते {name},",
  emailBooked: "{brand} के साथ आपका {meeting} बुक हो गया है।",
  emailWhen: "कब: {when}",
  emailWhere: "कहाँ: {where}",
  emailChange: "फिर मिलते हैं। कोई बदलाव हो तो इस ईमेल का जवाब दें।",
  emailAddToCalendar: "कैलेंडर में जोड़ें:",
  locPhoneLong: "फ़ोन कॉल — हम आपको कॉल करेंगे।",
  locVideoLong: "वीडियो कॉल — लिंक भेजा जाएगा।",
  locInPersonLong: "आमने-सामने।",
  unsubDoneTitle: "सदस्यता समाप्त",
  unsubDoneBody: "हो गया — अब आपको हमारी ओर से कोई संदेश नहीं मिलेगा।",
  unsubAlreadyTitle: "पहले ही हटाया गया",
  unsubAlreadyBody: "वह संपर्क नहीं मिला — शायद आपकी सदस्यता पहले ही समाप्त है।",
  unsubErrorTitle: "कुछ गड़बड़ हो गई",
  unsubErrorBody: "अभी प्रोसेस नहीं हो सका। “unsubscribe” लिखकर जवाब दें, हम संभाल लेंगे।",
};

/* Core catalogs for the remaining supported languages: the full prospect-visible
   happy path (lead form, booking page, confirmation email). Less-trafficked
   strings (cancel flow, errors, unsubscribe) fall back to English by design —
   the Partial merge guarantees nothing ever renders undefined. */

const bg: Partial<ProspectStrings> = {
  formThanksTitle: "Благодарим — ще се свържем с вас", formThanksBody: "Получихме данните ви. Някой от {brand} ще се свърже скоро.", formHeading: "Свържете се с {brand}", formSub: "Оставете данните си и ще се свържем.", labelName: "Име", labelEmail: "Имейл", labelPhone: "Телефон", labelCompany: "Фирма", labelMessage: "Съобщение", send: "Изпрати",
  bookingHeading: "Запазете {meeting} с {brand}", minutes: "мин", timesIn: "часове в {tz}", noTimes: "В момента няма свободни часове. Проверете отново скоро.", change: "промени", labelNotes: "Нещо, което да знаем?", confirm: "Потвърди резервацията", confirming: "Резервиране…", bookedTitle: "Резервацията е потвърдена", bookedWith: "{meeting} с {brand}",
  emailSubject: "Потвърдено: {meeting} с {brand}", emailGreeting: "Здравейте, {name},", emailBooked: "Имате резервация за {meeting} с {brand}.", emailWhen: "Кога: {when}", emailWhere: "Къде: {where}",
};
const hr: Partial<ProspectStrings> = {
  formThanksTitle: "Hvala — javit ćemo se", formThanksBody: "Vaši podaci su zaprimljeni. Netko iz {brand} javit će se uskoro.", formHeading: "Kontaktirajte {brand}", formSub: "Ostavite podatke i javit ćemo se.", labelName: "Ime", labelEmail: "E-mail", labelPhone: "Telefon", labelCompany: "Tvrtka", labelMessage: "Poruka", send: "Pošalji",
  bookingHeading: "Rezervirajte {meeting} s {brand}", minutes: "min", timesIn: "termini u {tz}", noTimes: "Trenutno nema dostupnih termina. Provjerite uskoro.", change: "promijeni", labelNotes: "Nešto što bismo trebali znati?", confirm: "Potvrdi rezervaciju", confirming: "Rezerviranje…", bookedTitle: "Rezervacija potvrđena", bookedWith: "{meeting} s {brand}",
  emailSubject: "Potvrđeno: {meeting} s {brand}", emailGreeting: "Pozdrav {name},", emailBooked: "Rezervirani ste za {meeting} s {brand}.", emailWhen: "Kada: {when}", emailWhere: "Gdje: {where}",
};
const cs: Partial<ProspectStrings> = {
  formThanksTitle: "Děkujeme — ozveme se", formThanksBody: "Vaše údaje máme. Někdo z {brand} se brzy ozve.", formHeading: "Kontaktujte {brand}", formSub: "Zanechte údaje a ozveme se.", labelName: "Jméno", labelEmail: "E-mail", labelPhone: "Telefon", labelCompany: "Společnost", labelMessage: "Zpráva", send: "Odeslat",
  bookingHeading: "Rezervujte si {meeting} s {brand}", minutes: "min", timesIn: "časy v {tz}", noTimes: "Momentálně nejsou k dispozici žádné termíny. Zkuste to brzy znovu.", change: "změnit", labelNotes: "Něco, co bychom měli vědět?", confirm: "Potvrdit rezervaci", confirming: "Rezervuji…", bookedTitle: "Rezervace potvrzena", bookedWith: "{meeting} s {brand}",
  emailSubject: "Potvrzeno: {meeting} s {brand}", emailGreeting: "Dobrý den, {name},", emailBooked: "Máte rezervaci na {meeting} s {brand}.", emailWhen: "Kdy: {when}", emailWhere: "Kde: {where}",
};
const da: Partial<ProspectStrings> = {
  formThanksTitle: "Tak — vi vender tilbage", formThanksBody: "Vi har modtaget dine oplysninger. Nogen fra {brand} kontakter dig snart.", formHeading: "Kontakt {brand}", formSub: "Efterlad dine oplysninger, så kontakter vi dig.", labelName: "Navn", labelEmail: "E-mail", labelPhone: "Telefon", labelCompany: "Virksomhed", labelMessage: "Besked", send: "Send",
  bookingHeading: "Book et {meeting} med {brand}", minutes: "min", timesIn: "tider i {tz}", noTimes: "Ingen ledige tider lige nu. Kig forbi igen snart.", change: "skift", labelNotes: "Noget vi bør vide?", confirm: "Bekræft booking", confirming: "Booker…", bookedTitle: "Din booking er bekræftet", bookedWith: "{meeting} med {brand}",
  emailSubject: "Bekræftet: {meeting} med {brand}", emailGreeting: "Hej {name},", emailBooked: "Du er booket til et {meeting} med {brand}.", emailWhen: "Hvornår: {when}", emailWhere: "Hvor: {where}",
};
const tl: Partial<ProspectStrings> = {
  formThanksTitle: "Salamat — makikipag-ugnayan kami", formThanksBody: "Natanggap na ang iyong detalye. May makikipag-ugnayan mula sa {brand} sa lalong madaling panahon.", formHeading: "Makipag-ugnayan sa {brand}", formSub: "Iwan ang iyong detalye at kokontakin ka namin.", labelName: "Pangalan", labelEmail: "Email", labelPhone: "Telepono", labelCompany: "Kumpanya", labelMessage: "Mensahe", send: "Ipadala",
  bookingHeading: "Mag-book ng {meeting} kasama ang {brand}", minutes: "min", timesIn: "mga oras sa {tz}", noTimes: "Walang available na oras ngayon. Bumalik muli sa lalong madaling panahon.", change: "palitan", labelNotes: "May dapat ba kaming malaman?", confirm: "Kumpirmahin ang booking", confirming: "Bino-book…", bookedTitle: "Nakumpirma ang booking", bookedWith: "{meeting} kasama ang {brand}",
  emailSubject: "Kumpirmado: {meeting} kasama ang {brand}", emailGreeting: "Hi {name},", emailBooked: "Naka-book ka para sa {meeting} kasama ang {brand}.", emailWhen: "Kailan: {when}", emailWhere: "Saan: {where}",
};
const fi: Partial<ProspectStrings> = {
  formThanksTitle: "Kiitos — olemme yhteydessä", formThanksBody: "Tietosi on vastaanotettu. Joku {brand}-tiimistä ottaa pian yhteyttä.", formHeading: "Ota yhteyttä: {brand}", formSub: "Jätä tietosi, niin otamme yhteyttä.", labelName: "Nimi", labelEmail: "Sähköposti", labelPhone: "Puhelin", labelCompany: "Yritys", labelMessage: "Viesti", send: "Lähetä",
  bookingHeading: "Varaa {meeting} — {brand}", minutes: "min", timesIn: "ajat vyöhykkeellä {tz}", noTimes: "Ei vapaita aikoja juuri nyt. Tarkista pian uudelleen.", change: "vaihda", labelNotes: "Jotain, mitä meidän tulisi tietää?", confirm: "Vahvista varaus", confirming: "Varataan…", bookedTitle: "Varaus vahvistettu", bookedWith: "{meeting} — {brand}",
  emailSubject: "Vahvistettu: {meeting} — {brand}", emailGreeting: "Hei {name},", emailBooked: "Sinulle on varattu {meeting} ({brand}).", emailWhen: "Milloin: {when}", emailWhere: "Missä: {where}",
};
const el: Partial<ProspectStrings> = {
  formThanksTitle: "Ευχαριστούμε — θα επικοινωνήσουμε", formThanksBody: "Λάβαμε τα στοιχεία σας. Κάποιος από την {brand} θα επικοινωνήσει σύντομα.", formHeading: "Επικοινωνήστε με την {brand}", formSub: "Αφήστε τα στοιχεία σας και θα επικοινωνήσουμε.", labelName: "Όνομα", labelEmail: "Email", labelPhone: "Τηλέφωνο", labelCompany: "Εταιρεία", labelMessage: "Μήνυμα", send: "Αποστολή",
  bookingHeading: "Κλείστε {meeting} με την {brand}", minutes: "λεπτά", timesIn: "ώρες σε {tz}", noTimes: "Δεν υπάρχουν διαθέσιμες ώρες αυτή τη στιγμή. Δοκιμάστε ξανά σύντομα.", change: "αλλαγή", labelNotes: "Κάτι που πρέπει να ξέρουμε;", confirm: "Επιβεβαίωση κράτησης", confirming: "Κράτηση…", bookedTitle: "Η κράτηση επιβεβαιώθηκε", bookedWith: "{meeting} με την {brand}",
  emailSubject: "Επιβεβαιώθηκε: {meeting} με την {brand}", emailGreeting: "Γεια σας {name},", emailBooked: "Έχετε κράτηση για {meeting} με την {brand}.", emailWhen: "Πότε: {when}", emailWhere: "Πού: {where}",
};
const hu: Partial<ProspectStrings> = {
  formThanksTitle: "Köszönjük — jelentkezünk", formThanksBody: "Adatait megkaptuk. A {brand} munkatársa hamarosan jelentkezik.", formHeading: "Lépjen kapcsolatba: {brand}", formSub: "Hagyja meg adatait, és jelentkezünk.", labelName: "Név", labelEmail: "E-mail", labelPhone: "Telefon", labelCompany: "Cég", labelMessage: "Üzenet", send: "Küldés",
  bookingHeading: "Foglaljon {meeting} időpontot — {brand}", minutes: "perc", timesIn: "időpontok: {tz}", noTimes: "Jelenleg nincs szabad időpont. Nézzen vissza hamarosan.", change: "módosítás", labelNotes: "Van bármi, amit tudnunk kell?", confirm: "Foglalás megerősítése", confirming: "Foglalás…", bookedTitle: "Foglalás megerősítve", bookedWith: "{meeting} — {brand}",
  emailSubject: "Megerősítve: {meeting} — {brand}", emailGreeting: "Kedves {name}!", emailBooked: "Időpontja lefoglalva: {meeting} — {brand}.", emailWhen: "Mikor: {when}", emailWhere: "Hol: {where}",
};
const id: Partial<ProspectStrings> = {
  formThanksTitle: "Terima kasih — kami akan menghubungi Anda", formThanksBody: "Data Anda sudah kami terima. Seseorang dari {brand} akan segera menghubungi.", formHeading: "Hubungi {brand}", formSub: "Tinggalkan data Anda dan kami akan menghubungi.", labelName: "Nama", labelEmail: "Email", labelPhone: "Telepon", labelCompany: "Perusahaan", labelMessage: "Pesan", send: "Kirim",
  bookingHeading: "Jadwalkan {meeting} dengan {brand}", minutes: "mnt", timesIn: "waktu dalam {tz}", noTimes: "Belum ada jadwal tersedia saat ini. Silakan cek kembali nanti.", change: "ubah", labelNotes: "Ada yang perlu kami ketahui?", confirm: "Konfirmasi jadwal", confirming: "Memesan…", bookedTitle: "Jadwal dikonfirmasi", bookedWith: "{meeting} dengan {brand}",
  emailSubject: "Terkonfirmasi: {meeting} dengan {brand}", emailGreeting: "Halo {name},", emailBooked: "Anda terjadwal untuk {meeting} dengan {brand}.", emailWhen: "Kapan: {when}", emailWhere: "Di mana: {where}",
};
const ms: Partial<ProspectStrings> = {
  formThanksTitle: "Terima kasih — kami akan menghubungi anda", formThanksBody: "Maklumat anda telah diterima. Seseorang daripada {brand} akan menghubungi tidak lama lagi.", formHeading: "Hubungi {brand}", formSub: "Tinggalkan maklumat anda dan kami akan menghubungi.", labelName: "Nama", labelEmail: "E-mel", labelPhone: "Telefon", labelCompany: "Syarikat", labelMessage: "Mesej", send: "Hantar",
  bookingHeading: "Tempah {meeting} dengan {brand}", minutes: "min", timesIn: "masa dalam {tz}", noTimes: "Tiada masa tersedia buat masa ini. Sila semak semula nanti.", change: "tukar", labelNotes: "Ada apa-apa yang perlu kami tahu?", confirm: "Sahkan tempahan", confirming: "Menempah…", bookedTitle: "Tempahan disahkan", bookedWith: "{meeting} dengan {brand}",
  emailSubject: "Disahkan: {meeting} dengan {brand}", emailGreeting: "Hai {name},", emailBooked: "Anda ditempah untuk {meeting} dengan {brand}.", emailWhen: "Bila: {when}", emailWhere: "Di mana: {where}",
};
const no: Partial<ProspectStrings> = {
  formThanksTitle: "Takk — vi tar kontakt", formThanksBody: "Vi har mottatt opplysningene dine. Noen fra {brand} tar snart kontakt.", formHeading: "Kontakt {brand}", formSub: "Legg igjen opplysningene dine, så tar vi kontakt.", labelName: "Navn", labelEmail: "E-post", labelPhone: "Telefon", labelCompany: "Firma", labelMessage: "Melding", send: "Send",
  bookingHeading: "Book et {meeting} med {brand}", minutes: "min", timesIn: "tider i {tz}", noTimes: "Ingen ledige tider akkurat nå. Sjekk igjen snart.", change: "endre", labelNotes: "Noe vi bør vite?", confirm: "Bekreft booking", confirming: "Booker…", bookedTitle: "Booking bekreftet", bookedWith: "{meeting} med {brand}",
  emailSubject: "Bekreftet: {meeting} med {brand}", emailGreeting: "Hei {name},", emailBooked: "Du er booket til et {meeting} med {brand}.", emailWhen: "Når: {when}", emailWhere: "Hvor: {where}",
};
const ro: Partial<ProspectStrings> = {
  formThanksTitle: "Mulțumim — vă contactăm în curând", formThanksBody: "Am primit datele dvs. Cineva de la {brand} vă va contacta în curând.", formHeading: "Contactați {brand}", formSub: "Lăsați-ne datele și vă contactăm.", labelName: "Nume", labelEmail: "Email", labelPhone: "Telefon", labelCompany: "Companie", labelMessage: "Mesaj", send: "Trimite",
  bookingHeading: "Programați un {meeting} cu {brand}", minutes: "min", timesIn: "ore în {tz}", noTimes: "Momentan nu sunt ore disponibile. Reveniți în curând.", change: "schimbă", labelNotes: "Ceva ce ar trebui să știm?", confirm: "Confirmă programarea", confirming: "Se programează…", bookedTitle: "Programare confirmată", bookedWith: "{meeting} cu {brand}",
  emailSubject: "Confirmat: {meeting} cu {brand}", emailGreeting: "Bună ziua, {name},", emailBooked: "Aveți o programare pentru {meeting} cu {brand}.", emailWhen: "Când: {when}", emailWhere: "Unde: {where}",
};
const ru: Partial<ProspectStrings> = {
  formThanksTitle: "Спасибо — мы свяжемся с вами", formThanksBody: "Ваши данные получены. Кто-то из {brand} скоро свяжется с вами.", formHeading: "Связаться с {brand}", formSub: "Оставьте свои данные, и мы свяжемся с вами.", labelName: "Имя", labelEmail: "Email", labelPhone: "Телефон", labelCompany: "Компания", labelMessage: "Сообщение", send: "Отправить",
  bookingHeading: "Записаться на {meeting} с {brand}", minutes: "мин", timesIn: "время в {tz}", noTimes: "Свободного времени сейчас нет. Загляните позже.", change: "изменить", labelNotes: "Что нам стоит знать?", confirm: "Подтвердить запись", confirming: "Бронирование…", bookedTitle: "Запись подтверждена", bookedWith: "{meeting} с {brand}",
  emailSubject: "Подтверждено: {meeting} с {brand}", emailGreeting: "Здравствуйте, {name}!", emailBooked: "Вы записаны на {meeting} с {brand}.", emailWhen: "Когда: {when}", emailWhere: "Где: {where}",
};
const sk: Partial<ProspectStrings> = {
  formThanksTitle: "Ďakujeme — ozveme sa", formThanksBody: "Vaše údaje máme. Niekto z {brand} sa čoskoro ozve.", formHeading: "Kontaktujte {brand}", formSub: "Nechajte nám údaje a ozveme sa.", labelName: "Meno", labelEmail: "E-mail", labelPhone: "Telefón", labelCompany: "Spoločnosť", labelMessage: "Správa", send: "Odoslať",
  bookingHeading: "Rezervujte si {meeting} s {brand}", minutes: "min", timesIn: "časy v {tz}", noTimes: "Momentálne nie sú dostupné žiadne termíny. Skúste to čoskoro znova.", change: "zmeniť", labelNotes: "Niečo, čo by sme mali vedieť?", confirm: "Potvrdiť rezerváciu", confirming: "Rezervujem…", bookedTitle: "Rezervácia potvrdená", bookedWith: "{meeting} s {brand}",
  emailSubject: "Potvrdené: {meeting} s {brand}", emailGreeting: "Dobrý deň, {name},", emailBooked: "Máte rezerváciu na {meeting} s {brand}.", emailWhen: "Kedy: {when}", emailWhere: "Kde: {where}",
};
const sv: Partial<ProspectStrings> = {
  formThanksTitle: "Tack — vi hör av oss", formThanksBody: "Vi har tagit emot dina uppgifter. Någon från {brand} hör snart av sig.", formHeading: "Kontakta {brand}", formSub: "Lämna dina uppgifter så hör vi av oss.", labelName: "Namn", labelEmail: "E-post", labelPhone: "Telefon", labelCompany: "Företag", labelMessage: "Meddelande", send: "Skicka",
  bookingHeading: "Boka ett {meeting} med {brand}", minutes: "min", timesIn: "tider i {tz}", noTimes: "Inga lediga tider just nu. Titta tillbaka snart.", change: "ändra", labelNotes: "Något vi bör veta?", confirm: "Bekräfta bokning", confirming: "Bokar…", bookedTitle: "Bokningen är bekräftad", bookedWith: "{meeting} med {brand}",
  emailSubject: "Bekräftat: {meeting} med {brand}", emailGreeting: "Hej {name},", emailBooked: "Du är bokad för ett {meeting} med {brand}.", emailWhen: "När: {when}", emailWhere: "Var: {where}",
};
const ta: Partial<ProspectStrings> = {
  formThanksTitle: "நன்றி — விரைவில் தொடர்பு கொள்கிறோம்", formThanksBody: "உங்கள் விவரங்கள் கிடைத்தன. {brand} அணியில் இருந்து விரைவில் தொடர்பு கொள்வோம்.", formHeading: "{brand} உடன் தொடர்பு கொள்ளுங்கள்", formSub: "உங்கள் விவரங்களை விடுங்கள்; நாங்கள் தொடர்பு கொள்கிறோம்.", labelName: "பெயர்", labelEmail: "மின்னஞ்சல்", labelPhone: "தொலைபேசி", labelCompany: "நிறுவனம்", labelMessage: "செய்தி", send: "அனுப்பு",
  bookingHeading: "{brand} உடன் {meeting} பதிவு செய்யுங்கள்", minutes: "நிமி", timesIn: "{tz} நேரப்படி", noTimes: "தற்போது நேரங்கள் இல்லை. விரைவில் மீண்டும் பாருங்கள்.", change: "மாற்று", labelNotes: "நாங்கள் தெரிந்து கொள்ள வேண்டியது ஏதேனும்?", confirm: "பதிவை உறுதிப்படுத்து", confirming: "பதிவு செய்கிறது…", bookedTitle: "பதிவு உறுதியானது", bookedWith: "{brand} உடன் {meeting}",
  emailSubject: "உறுதியானது: {brand} உடன் {meeting}", emailGreeting: "வணக்கம் {name},", emailBooked: "{brand} உடன் {meeting} பதிவு செய்யப்பட்டுள்ளது.", emailWhen: "எப்போது: {when}", emailWhere: "எங்கே: {where}",
};
const tr: Partial<ProspectStrings> = {
  formThanksTitle: "Teşekkürler — sizinle iletişime geçeceğiz", formThanksBody: "Bilgileriniz alındı. {brand} ekibinden biri kısa süre içinde ulaşacak.", formHeading: "{brand} ile iletişime geçin", formSub: "Bilgilerinizi bırakın, size ulaşalım.", labelName: "Ad", labelEmail: "E-posta", labelPhone: "Telefon", labelCompany: "Şirket", labelMessage: "Mesaj", send: "Gönder",
  bookingHeading: "{brand} ile {meeting} planlayın", minutes: "dk", timesIn: "saatler: {tz}", noTimes: "Şu anda uygun saat yok. Lütfen kısa süre sonra tekrar bakın.", change: "değiştir", labelNotes: "Bilmemiz gereken bir şey var mı?", confirm: "Randevuyu onayla", confirming: "Ayırtılıyor…", bookedTitle: "Randevu onaylandı", bookedWith: "{brand} ile {meeting}",
  emailSubject: "Onaylandı: {brand} ile {meeting}", emailGreeting: "Merhaba {name},", emailBooked: "{brand} ile {meeting} için randevunuz alındı.", emailWhen: "Ne zaman: {when}", emailWhere: "Nerede: {where}",
};
const uk: Partial<ProspectStrings> = {
  formThanksTitle: "Дякуємо — ми зв'яжемося з вами", formThanksBody: "Ваші дані отримано. Хтось із {brand} невдовзі зв'яжеться.", formHeading: "Зв'язатися з {brand}", formSub: "Залиште свої дані, і ми зв'яжемося.", labelName: "Ім'я", labelEmail: "Email", labelPhone: "Телефон", labelCompany: "Компанія", labelMessage: "Повідомлення", send: "Надіслати",
  bookingHeading: "Забронювати {meeting} з {brand}", minutes: "хв", timesIn: "час у {tz}", noTimes: "Наразі немає вільного часу. Завітайте пізніше.", change: "змінити", labelNotes: "Що нам варто знати?", confirm: "Підтвердити бронювання", confirming: "Бронювання…", bookedTitle: "Бронювання підтверджено", bookedWith: "{meeting} з {brand}",
  emailSubject: "Підтверджено: {meeting} з {brand}", emailGreeting: "Вітаємо, {name}!", emailBooked: "Вас записано на {meeting} з {brand}.", emailWhen: "Коли: {when}", emailWhere: "Де: {where}",
};
const vi: Partial<ProspectStrings> = {
  formThanksTitle: "Cảm ơn — chúng tôi sẽ liên hệ", formThanksBody: "Đã nhận được thông tin của bạn. Người từ {brand} sẽ sớm liên hệ.", formHeading: "Liên hệ với {brand}", formSub: "Để lại thông tin và chúng tôi sẽ liên hệ.", labelName: "Họ tên", labelEmail: "Email", labelPhone: "Điện thoại", labelCompany: "Công ty", labelMessage: "Tin nhắn", send: "Gửi",
  bookingHeading: "Đặt lịch {meeting} với {brand}", minutes: "phút", timesIn: "giờ theo {tz}", noTimes: "Hiện chưa có khung giờ trống. Vui lòng quay lại sau.", change: "đổi", labelNotes: "Có điều gì chúng tôi nên biết?", confirm: "Xác nhận lịch hẹn", confirming: "Đang đặt…", bookedTitle: "Đã xác nhận lịch hẹn", bookedWith: "{meeting} với {brand}",
  emailSubject: "Đã xác nhận: {meeting} với {brand}", emailGreeting: "Chào {name},", emailBooked: "Bạn đã được đặt lịch {meeting} với {brand}.", emailWhen: "Khi nào: {when}", emailWhere: "Ở đâu: {where}",
};

const af: Partial<ProspectStrings> = {
  formThanksTitle: "Dankie — ons kontak jou binnekort", formThanksBody: "Ons het jou besonderhede ontvang. Iemand van {brand} sal binnekort uitreik.", formHeading: "Kontak {brand}", formSub: "Los jou besonderhede en ons kontak jou.", labelName: "Naam", labelEmail: "E-pos", labelPhone: "Telefoon", labelCompany: "Maatskappy", labelMessage: "Boodskap", send: "Stuur",
  bookingHeading: "Bespreek 'n {meeting} met {brand}", minutes: "min", timesIn: "tye in {tz}", noTimes: "Geen tye is nou beskikbaar nie. Kom kyk gou weer.", change: "verander", labelNotes: "Iets wat ons moet weet?", confirm: "Bevestig bespreking", confirming: "Bespreek…", bookedTitle: "Bespreking bevestig", bookedWith: "{meeting} met {brand}",
  emailSubject: "Bevestig: {meeting} met {brand}", emailGreeting: "Hallo {name},", emailBooked: "Jy is bespreek vir 'n {meeting} met {brand}.", emailWhen: "Wanneer: {when}", emailWhere: "Waar: {where}",
};
const sq: Partial<ProspectStrings> = {
  formThanksTitle: "Faleminderit — do t'ju kontaktojmë", formThanksBody: "Të dhënat tuaja u morën. Dikush nga {brand} do t'ju kontaktojë së shpejti.", formHeading: "Kontaktoni {brand}", formSub: "Lini të dhënat tuaja dhe do t'ju kontaktojmë.", labelName: "Emri", labelEmail: "Email", labelPhone: "Telefoni", labelCompany: "Kompania", labelMessage: "Mesazhi", send: "Dërgo",
  bookingHeading: "Rezervoni një {meeting} me {brand}", minutes: "min", timesIn: "oraret në {tz}", noTimes: "Nuk ka orare të lira tani. Kontrolloni sërish së shpejti.", change: "ndrysho", labelNotes: "Diçka që duhet ta dimë?", confirm: "Konfirmo rezervimin", confirming: "Duke rezervuar…", bookedTitle: "Rezervimi u konfirmua", bookedWith: "{meeting} me {brand}",
  emailSubject: "Konfirmuar: {meeting} me {brand}", emailGreeting: "Përshëndetje {name},", emailBooked: "Jeni rezervuar për një {meeting} me {brand}.", emailWhen: "Kur: {when}", emailWhere: "Ku: {where}",
};
const am: Partial<ProspectStrings> = {
  formThanksTitle: "እናመሰግናለን — እናገኝዎታለን", formThanksBody: "ዝርዝሮችዎ ደርሰዋል። ከ{brand} ሰው በቅርቡ ያገኝዎታል።", formHeading: "{brand}ን ያግኙ", formSub: "ዝርዝሮችዎን ይተዉ እና እናገኝዎታለን።", labelName: "ስም", labelEmail: "ኢሜይል", labelPhone: "ስልክ", labelCompany: "ኩባንያ", labelMessage: "መልእክት", send: "ላክ",
  bookingHeading: "ከ{brand} ጋር {meeting} ይያዙ", minutes: "ደቂቃ", timesIn: "ሰዓቶች በ{tz}", noTimes: "አሁን ክፍት ሰዓት የለም። በቅርቡ ደግመው ይሞክሩ።", change: "ቀይር", labelNotes: "ማወቅ ያለብን ነገር አለ?", confirm: "ቀጠሮውን አረጋግጥ", confirming: "በመያዝ ላይ…", bookedTitle: "ቀጠሮው ተረጋግጧል", bookedWith: "{meeting} ከ{brand} ጋር",
  emailSubject: "ተረጋግጧል: {meeting} ከ{brand} ጋር", emailGreeting: "ሰላም {name},", emailBooked: "ከ{brand} ጋር ለ{meeting} ተይዘዋል።", emailWhen: "መቼ: {when}", emailWhere: "የት: {where}",
};
const hy: Partial<ProspectStrings> = {
  formThanksTitle: "Շնորհակալություն — կկապվենք ձեզ հետ", formThanksBody: "Ձեր տվյալները ստացվել են։ {brand}-ից որևէ մեկը շուտով կկապվի։", formHeading: "Կապվեք {brand}-ի հետ", formSub: "Թողեք ձեր տվյալները, և մենք կկապվենք։", labelName: "Անուն", labelEmail: "Էլ. փոստ", labelPhone: "Հեռախոս", labelCompany: "Ընկերություն", labelMessage: "Հաղորդագրություն", send: "Ուղարկել",
  bookingHeading: "Ամրագրեք {meeting} {brand}-ի հետ", minutes: "րոպե", timesIn: "ժամերը {tz}-ով", noTimes: "Այս պահին ազատ ժամեր չկան։ Շուտով նորից ստուգեք։", change: "փոխել", labelNotes: "Ինչ-որ բան, որ պետք է իմանանք?", confirm: "Հաստատել ամրագրումը", confirming: "Ամրագրում…", bookedTitle: "Ամրագրումը հաստատված է", bookedWith: "{meeting} {brand}-ի հետ",
  emailSubject: "Հաստատված է: {meeting} {brand}-ի հետ", emailGreeting: "Բարև {name},", emailBooked: "Դուք ամրագրված եք {meeting}-ի համար {brand}-ի հետ։", emailWhen: "Երբ: {when}", emailWhere: "Որտեղ: {where}",
};
const az: Partial<ProspectStrings> = {
  formThanksTitle: "Təşəkkürlər — sizinlə əlaqə saxlayacağıq", formThanksBody: "Məlumatlarınız alındı. {brand} komandasından biri tezliklə əlaqə saxlayacaq.", formHeading: "{brand} ilə əlaqə saxlayın", formSub: "Məlumatlarınızı buraxın, sizinlə əlaqə saxlayaq.", labelName: "Ad", labelEmail: "E-poçt", labelPhone: "Telefon", labelCompany: "Şirkət", labelMessage: "Mesaj", send: "Göndər",
  bookingHeading: "{brand} ilə {meeting} sifariş edin", minutes: "dəq", timesIn: "vaxtlar {tz} üzrə", noTimes: "Hazırda boş vaxt yoxdur. Tezliklə yenidən yoxlayın.", change: "dəyiş", labelNotes: "Bilməli olduğumuz bir şey var?", confirm: "Sifarişi təsdiqlə", confirming: "Sifariş edilir…", bookedTitle: "Sifariş təsdiqləndi", bookedWith: "{brand} ilə {meeting}",
  emailSubject: "Təsdiqləndi: {brand} ilə {meeting}", emailGreeting: "Salam {name},", emailBooked: "{brand} ilə {meeting} üçün sifarişiniz var.", emailWhen: "Nə vaxt: {when}", emailWhere: "Harada: {where}",
};
const be: Partial<ProspectStrings> = {
  formThanksTitle: "Дзякуй — мы звяжамся з вамі", formThanksBody: "Вашы даныя атрыманы. Хтосьці з {brand} хутка звяжацца.", formHeading: "Звязацца з {brand}", formSub: "Пакіньце свае даныя, і мы звяжамся.", labelName: "Імя", labelEmail: "Email", labelPhone: "Тэлефон", labelCompany: "Кампанія", labelMessage: "Паведамленне", send: "Адправіць",
  bookingHeading: "Запісацца на {meeting} з {brand}", minutes: "хв", timesIn: "час у {tz}", noTimes: "Зараз няма вольнага часу. Зазірніце пазней.", change: "змяніць", labelNotes: "Што нам варта ведаць?", confirm: "Пацвердзіць запіс", confirming: "Браніраванне…", bookedTitle: "Запіс пацверджаны", bookedWith: "{meeting} з {brand}",
  emailSubject: "Пацверджана: {meeting} з {brand}", emailGreeting: "Вітаем, {name}!", emailBooked: "Вы запісаны на {meeting} з {brand}.", emailWhen: "Калі: {when}", emailWhere: "Дзе: {where}",
};
const bn: Partial<ProspectStrings> = {
  formThanksTitle: "ধন্যবাদ — আমরা যোগাযোগ করব", formThanksBody: "আপনার তথ্য পেয়েছি। {brand} থেকে কেউ শীঘ্রই যোগাযোগ করবে।", formHeading: "{brand}-এর সাথে যোগাযোগ করুন", formSub: "আপনার তথ্য দিন, আমরা যোগাযোগ করব।", labelName: "নাম", labelEmail: "ইমেইল", labelPhone: "ফোন", labelCompany: "কোম্পানি", labelMessage: "বার্তা", send: "পাঠান",
  bookingHeading: "{brand}-এর সাথে {meeting} বুক করুন", minutes: "মিনিট", timesIn: "{tz} অনুযায়ী সময়", noTimes: "এখন কোনো সময় খালি নেই। শীঘ্রই আবার দেখুন।", change: "পরিবর্তন", labelNotes: "আমাদের জানার মতো কিছু?", confirm: "বুকিং নিশ্চিত করুন", confirming: "বুক করা হচ্ছে…", bookedTitle: "বুকিং নিশ্চিত হয়েছে", bookedWith: "{brand}-এর সাথে {meeting}",
  emailSubject: "নিশ্চিত: {brand}-এর সাথে {meeting}", emailGreeting: "হাই {name},", emailBooked: "{brand}-এর সাথে {meeting}-এর জন্য আপনার বুকিং হয়েছে।", emailWhen: "কখন: {when}", emailWhere: "কোথায়: {where}",
};
const bs: Partial<ProspectStrings> = {
  formThanksTitle: "Hvala — javit ćemo se", formThanksBody: "Vaši podaci su zaprimljeni. Neko iz {brand} će se uskoro javiti.", formHeading: "Kontaktirajte {brand}", formSub: "Ostavite podatke i javit ćemo se.", labelName: "Ime", labelEmail: "E-mail", labelPhone: "Telefon", labelCompany: "Kompanija", labelMessage: "Poruka", send: "Pošalji",
  bookingHeading: "Rezervišite {meeting} sa {brand}", minutes: "min", timesIn: "termini u {tz}", noTimes: "Trenutno nema dostupnih termina. Provjerite uskoro.", change: "promijeni", labelNotes: "Nešto što bismo trebali znati?", confirm: "Potvrdi rezervaciju", confirming: "Rezervišem…", bookedTitle: "Rezervacija potvrđena", bookedWith: "{meeting} sa {brand}",
  emailSubject: "Potvrđeno: {meeting} sa {brand}", emailGreeting: "Zdravo {name},", emailBooked: "Rezervisani ste za {meeting} sa {brand}.", emailWhen: "Kada: {when}", emailWhere: "Gdje: {where}",
};
const my: Partial<ProspectStrings> = {
  formThanksTitle: "ကျေးဇူးတင်ပါသည် — ဆက်သွယ်ပါမည်", formThanksBody: "သင့်အချက်အလက်များ ရရှိပါပြီ။ {brand} မှ တစ်ဦးက မကြာမီ ဆက်သွယ်ပါမည်။", formHeading: "{brand} ကို ဆက်သွယ်ရန်", formSub: "အချက်အလက်ထားခဲ့ပါ၊ ကျွန်ုပ်တို့ ဆက်သွယ်ပါမည်။", labelName: "အမည်", labelEmail: "အီးမေးလ်", labelPhone: "ဖုန်း", labelCompany: "ကုမ္ပဏီ", labelMessage: "စာ", send: "ပို့ရန်",
  bookingHeading: "{brand} နှင့် {meeting} ရက်ချိန်းယူရန်", minutes: "မိနစ်", timesIn: "{tz} အချိန်များ", noTimes: "ယခု အချိန်လွတ်မရှိပါ။ မကြာမီ ပြန်စစ်ပါ။", change: "ပြောင်းရန်", labelNotes: "ကျွန်ုပ်တို့ သိသင့်သည့်အရာ ရှိပါသလား?", confirm: "ရက်ချိန်း အတည်ပြုရန်", confirming: "ယူနေသည်…", bookedTitle: "ရက်ချိန်း အတည်ပြုပြီး", bookedWith: "{brand} နှင့် {meeting}",
  emailSubject: "အတည်ပြုပြီး: {brand} နှင့် {meeting}", emailGreeting: "မင်္ဂလာပါ {name},", emailBooked: "{brand} နှင့် {meeting} အတွက် ရက်ချိန်းယူပြီးပါပြီ။", emailWhen: "မည်သည့်အချိန်: {when}", emailWhere: "မည်သည့်နေရာ: {where}",
};
const ca: Partial<ProspectStrings> = {
  formThanksTitle: "Gràcies — ens posarem en contacte", formThanksBody: "Hem rebut les teves dades. Algú de {brand} et contactarà aviat.", formHeading: "Contacta amb {brand}", formSub: "Deixa'ns les teves dades i et contactarem.", labelName: "Nom", labelEmail: "Correu electrònic", labelPhone: "Telèfon", labelCompany: "Empresa", labelMessage: "Missatge", send: "Envia",
  bookingHeading: "Reserva un {meeting} amb {brand}", minutes: "min", timesIn: "hores en {tz}", noTimes: "Ara mateix no hi ha hores disponibles. Torna-ho a mirar aviat.", change: "canvia", labelNotes: "Res que hàgim de saber?", confirm: "Confirma la reserva", confirming: "Reservant…", bookedTitle: "Reserva confirmada", bookedWith: "{meeting} amb {brand}",
  emailSubject: "Confirmat: {meeting} amb {brand}", emailGreeting: "Hola {name},", emailBooked: "Tens una reserva per a un {meeting} amb {brand}.", emailWhen: "Quan: {when}", emailWhere: "On: {where}",
};
const et: Partial<ProspectStrings> = {
  formThanksTitle: "Aitäh — võtame ühendust", formThanksBody: "Sinu andmed on käes. Keegi {brand}-ist võtab peagi ühendust.", formHeading: "Võta ühendust: {brand}", formSub: "Jäta oma andmed ja võtame ühendust.", labelName: "Nimi", labelEmail: "E-post", labelPhone: "Telefon", labelCompany: "Ettevõte", labelMessage: "Sõnum", send: "Saada",
  bookingHeading: "Broneeri {meeting} — {brand}", minutes: "min", timesIn: "ajad vööndis {tz}", noTimes: "Praegu vabu aegu pole. Vaata varsti uuesti.", change: "muuda", labelNotes: "Midagi, mida peaksime teadma?", confirm: "Kinnita broneering", confirming: "Broneerin…", bookedTitle: "Broneering kinnitatud", bookedWith: "{meeting} — {brand}",
  emailSubject: "Kinnitatud: {meeting} — {brand}", emailGreeting: "Tere {name},", emailBooked: "Sulle on broneeritud {meeting} ({brand}).", emailWhen: "Millal: {when}", emailWhere: "Kus: {where}",
};
const ka: Partial<ProspectStrings> = {
  formThanksTitle: "მადლობა — დაგიკავშირდებით", formThanksBody: "თქვენი მონაცემები მივიღეთ. {brand}-დან ვინმე მალე დაგიკავშირდებათ.", formHeading: "დაუკავშირდით {brand}-ს", formSub: "დატოვეთ მონაცემები და დაგიკავშირდებით.", labelName: "სახელი", labelEmail: "ელფოსტა", labelPhone: "ტელეფონი", labelCompany: "კომპანია", labelMessage: "შეტყობინება", send: "გაგზავნა",
  bookingHeading: "დაჯავშნეთ {meeting} {brand}-თან", minutes: "წთ", timesIn: "დრო {tz}-ში", noTimes: "ამჟამად თავისუფალი დრო არ არის. მალე შეამოწმეთ.", change: "შეცვლა", labelNotes: "რამე, რაც უნდა ვიცოდეთ?", confirm: "ჯავშნის დადასტურება", confirming: "იჯავშნება…", bookedTitle: "ჯავშანი დადასტურდა", bookedWith: "{meeting} {brand}-თან",
  emailSubject: "დადასტურდა: {meeting} {brand}-თან", emailGreeting: "გამარჯობა {name},", emailBooked: "დაჯავშნილი გაქვთ {meeting} {brand}-თან.", emailWhen: "როდის: {when}", emailWhere: "სად: {where}",
};
const gu: Partial<ProspectStrings> = {
  formThanksTitle: "આભાર — અમે સંપર્ક કરીશું", formThanksBody: "તમારી વિગતો મળી ગઈ છે. {brand} તરફથી કોઈ ટૂંક સમયમાં સંપર્ક કરશે.", formHeading: "{brand} નો સંપર્ક કરો", formSub: "તમારી વિગતો આપો અને અમે સંપર્ક કરીશું.", labelName: "નામ", labelEmail: "ઇમેઇલ", labelPhone: "ફોન", labelCompany: "કંપની", labelMessage: "સંદેશ", send: "મોકલો",
  bookingHeading: "{brand} સાથે {meeting} બુક કરો", minutes: "મિનિટ", timesIn: "{tz} મુજબ સમય", noTimes: "હમણાં કોઈ સમય ઉપલબ્ધ નથી. ટૂંક સમયમાં ફરી તપાસો.", change: "બદલો", labelNotes: "અમારે જાણવા જેવું કંઈ?", confirm: "બુકિંગ કન્ફર્મ કરો", confirming: "બુક થઈ રહ્યું છે…", bookedTitle: "બુકિંગ કન્ફર્મ થયું", bookedWith: "{brand} સાથે {meeting}",
  emailSubject: "કન્ફર્મ: {brand} સાથે {meeting}", emailGreeting: "નમસ્તે {name},", emailBooked: "{brand} સાથે {meeting} માટે તમારું બુકિંગ થયું છે.", emailWhen: "ક્યારે: {when}", emailWhere: "ક્યાં: {where}",
};
const ha: Partial<ProspectStrings> = {
  formThanksTitle: "Mun gode — za mu tuntube ka", formThanksBody: "Mun karɓi bayananka. Wani daga {brand} zai tuntube ka nan ba da jimawa ba.", formHeading: "Tuntuɓi {brand}", formSub: "Bar bayananka, za mu tuntube ka.", labelName: "Suna", labelEmail: "Imel", labelPhone: "Waya", labelCompany: "Kamfani", labelMessage: "Saƙo", send: "Aika",
  bookingHeading: "Yi ajiyar {meeting} tare da {brand}", minutes: "min", timesIn: "lokuta a {tz}", noTimes: "Babu lokacin da ke akwai yanzu. Duba nan gaba kaɗan.", change: "canza", labelNotes: "Akwai abin da ya kamata mu sani?", confirm: "Tabbatar da ajiyar", confirming: "Ana ajiye…", bookedTitle: "An tabbatar da ajiyar", bookedWith: "{meeting} tare da {brand}",
  emailSubject: "An tabbatar: {meeting} tare da {brand}", emailGreeting: "Sannu {name},", emailBooked: "An yi maka ajiyar {meeting} tare da {brand}.", emailWhen: "Yaushe: {when}", emailWhere: "Ina: {where}",
};
const he: Partial<ProspectStrings> = {
  dir: "rtl",
  formThanksTitle: "תודה — ניצור קשר בקרוב", formThanksBody: "הפרטים שלך התקבלו. מישהו מ-{brand} ייצור קשר בקרוב.", formHeading: "יצירת קשר עם {brand}", formSub: "השאירו פרטים וניצור קשר.", labelName: "שם", labelEmail: "אימייל", labelPhone: "טלפון", labelCompany: "חברה", labelMessage: "הודעה", send: "שליחה",
  bookingHeading: "קביעת {meeting} עם {brand}", minutes: "דק'", timesIn: "שעות לפי {tz}", noTimes: "אין שעות פנויות כרגע. בדקו שוב בקרוב.", change: "שינוי", labelNotes: "משהו שכדאי שנדע?", confirm: "אישור הפגישה", confirming: "קובע…", bookedTitle: "הפגישה נקבעה", bookedWith: "{meeting} עם {brand}",
  emailSubject: "אושר: {meeting} עם {brand}", emailGreeting: "שלום {name},", emailBooked: "נקבעה לך {meeting} עם {brand}.", emailWhen: "מתי: {when}", emailWhere: "איפה: {where}",
};
const is: Partial<ProspectStrings> = {
  formThanksTitle: "Takk — við höfum samband", formThanksBody: "Upplýsingarnar þínar bárust. Einhver frá {brand} hefur samband fljótlega.", formHeading: "Hafðu samband við {brand}", formSub: "Skildu eftir upplýsingar og við höfum samband.", labelName: "Nafn", labelEmail: "Netfang", labelPhone: "Sími", labelCompany: "Fyrirtæki", labelMessage: "Skilaboð", send: "Senda",
  bookingHeading: "Bókaðu {meeting} með {brand}", minutes: "mín", timesIn: "tímar í {tz}", noTimes: "Engir lausir tímar núna. Kíktu aftur fljótlega.", change: "breyta", labelNotes: "Eitthvað sem við ættum að vita?", confirm: "Staðfesta bókun", confirming: "Bóka…", bookedTitle: "Bókun staðfest", bookedWith: "{meeting} með {brand}",
  emailSubject: "Staðfest: {meeting} með {brand}", emailGreeting: "Hæ {name},", emailBooked: "Þú ert bókaður í {meeting} með {brand}.", emailWhen: "Hvenær: {when}", emailWhere: "Hvar: {where}",
};
const ga: Partial<ProspectStrings> = {
  formThanksTitle: "Go raibh maith agat — beimid i dteagmháil", formThanksBody: "Tá do chuid sonraí faighte againn. Beidh duine ó {brand} i dteagmháil go luath.", formHeading: "Déan teagmháil le {brand}", formSub: "Fág do shonraí agus beimid i dteagmháil.", labelName: "Ainm", labelEmail: "Ríomhphost", labelPhone: "Fón", labelCompany: "Comhlacht", labelMessage: "Teachtaireacht", send: "Seol",
  bookingHeading: "Cuir {meeting} in áirithe le {brand}", minutes: "nóim", timesIn: "amanna in {tz}", noTimes: "Níl aon amanna ar fáil faoi láthair. Féach arís go luath.", change: "athraigh", labelNotes: "Aon rud ba chóir dúinn a bheith ar eolas?", confirm: "Deimhnigh an áirithint", confirming: "Ag cur in áirithe…", bookedTitle: "Áirithint deimhnithe", bookedWith: "{meeting} le {brand}",
  emailSubject: "Deimhnithe: {meeting} le {brand}", emailGreeting: "Dia dhuit {name},", emailBooked: "Tá {meeting} curtha in áirithe agat le {brand}.", emailWhen: "Cathain: {when}", emailWhere: "Cá háit: {where}",
};
const jv: Partial<ProspectStrings> = {
  formThanksTitle: "Matur nuwun — kita bakal ngubungi", formThanksBody: "Data sampeyan wis ditampa. Wong saka {brand} bakal enggal ngubungi.", formHeading: "Hubungi {brand}", formSub: "Tinggalake data sampeyan, kita bakal ngubungi.", labelName: "Jeneng", labelEmail: "Email", labelPhone: "Telpon", labelCompany: "Perusahaan", labelMessage: "Pesen", send: "Kirim",
  bookingHeading: "Pesen {meeting} karo {brand}", minutes: "mnt", timesIn: "wektu ing {tz}", noTimes: "Ora ana wektu kosong saiki. Priksa maneh mengko.", change: "ganti", labelNotes: "Ana sing kudu kita ngerteni?", confirm: "Konfirmasi pesenan", confirming: "Mesen…", bookedTitle: "Pesenan dikonfirmasi", bookedWith: "{meeting} karo {brand}",
  emailSubject: "Dikonfirmasi: {meeting} karo {brand}", emailGreeting: "Halo {name},", emailBooked: "Sampeyan wis kadaftar kanggo {meeting} karo {brand}.", emailWhen: "Kapan: {when}", emailWhere: "Ing endi: {where}",
};
const kn: Partial<ProspectStrings> = {
  formThanksTitle: "ಧನ್ಯವಾದಗಳು — ನಾವು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ", formThanksBody: "ನಿಮ್ಮ ವಿವರಗಳು ತಲುಪಿವೆ. {brand} ನಿಂದ ಯಾರಾದರೂ ಶೀಘ್ರದಲ್ಲೇ ಸಂಪರ್ಕಿಸುತ್ತಾರೆ.", formHeading: "{brand} ಅನ್ನು ಸಂಪರ್ಕಿಸಿ", formSub: "ನಿಮ್ಮ ವಿವರಗಳನ್ನು ನೀಡಿ, ನಾವು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.", labelName: "ಹೆಸರು", labelEmail: "ಇಮೇಲ್", labelPhone: "ಫೋನ್", labelCompany: "ಕಂಪನಿ", labelMessage: "ಸಂದೇಶ", send: "ಕಳುಹಿಸಿ",
  bookingHeading: "{brand} ಜೊತೆ {meeting} ಬುಕ್ ಮಾಡಿ", minutes: "ನಿಮಿಷ", timesIn: "{tz} ಪ್ರಕಾರ ಸಮಯ", noTimes: "ಸದ್ಯ ಯಾವುದೇ ಸಮಯ ಲಭ್ಯವಿಲ್ಲ. ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ನೋಡಿ.", change: "ಬದಲಿಸಿ", labelNotes: "ನಾವು ತಿಳಿದಿರಬೇಕಾದದ್ದು ಏನಾದರೂ?", confirm: "ಬುಕಿಂಗ್ ದೃಢೀಕರಿಸಿ", confirming: "ಬುಕ್ ಆಗುತ್ತಿದೆ…", bookedTitle: "ಬುಕಿಂಗ್ ದೃಢೀಕೃತವಾಗಿದೆ", bookedWith: "{brand} ಜೊತೆ {meeting}",
  emailSubject: "ದೃಢೀಕೃತ: {brand} ಜೊತೆ {meeting}", emailGreeting: "ನಮಸ್ಕಾರ {name},", emailBooked: "{brand} ಜೊತೆ {meeting} ಗಾಗಿ ನಿಮ್ಮ ಬುಕಿಂಗ್ ಆಗಿದೆ.", emailWhen: "ಯಾವಾಗ: {when}", emailWhere: "ಎಲ್ಲಿ: {where}",
};
const kk: Partial<ProspectStrings> = {
  formThanksTitle: "Рақмет — сізбен байланысамыз", formThanksBody: "Деректеріңіз алынды. {brand} тарапынан біреу жақын арада хабарласады.", formHeading: "{brand}-пен байланысу", formSub: "Деректеріңізді қалдырыңыз, біз хабарласамыз.", labelName: "Аты", labelEmail: "Email", labelPhone: "Телефон", labelCompany: "Компания", labelMessage: "Хабарлама", send: "Жіберу",
  bookingHeading: "{brand}-пен {meeting} брондау", minutes: "мин", timesIn: "{tz} бойынша уақыт", noTimes: "Қазір бос уақыт жоқ. Жақында қайта қараңыз.", change: "өзгерту", labelNotes: "Біз білуге тиіс нәрсе бар ма?", confirm: "Брондауды растау", confirming: "Брондалуда…", bookedTitle: "Брондау расталды", bookedWith: "{brand}-пен {meeting}",
  emailSubject: "Расталды: {brand}-пен {meeting}", emailGreeting: "Сәлеметсіз бе, {name}!", emailBooked: "{brand}-пен {meeting} үшін брондалдыңыз.", emailWhen: "Қашан: {when}", emailWhere: "Қайда: {where}",
};
const km: Partial<ProspectStrings> = {
  formThanksTitle: "អរគុណ — យើងនឹងទាក់ទងទៅ", formThanksBody: "ព័ត៌មានរបស់អ្នកបានមកដល់ហើយ។ នរណាម្នាក់ពី {brand} នឹងទាក់ទងឆាប់ៗ។", formHeading: "ទាក់ទង {brand}", formSub: "ទុកព័ត៌មានរបស់អ្នក ហើយយើងនឹងទាក់ទងទៅ។", labelName: "ឈ្មោះ", labelEmail: "អ៊ីមែល", labelPhone: "ទូរស័ព្ទ", labelCompany: "ក្រុមហ៊ុន", labelMessage: "សារ", send: "ផ្ញើ",
  bookingHeading: "កក់ {meeting} ជាមួយ {brand}", minutes: "នាទី", timesIn: "ម៉ោងតាម {tz}", noTimes: "មិនមានម៉ោងទំនេរឥឡូវទេ។ សូមពិនិត្យម្តងទៀតឆាប់ៗ។", change: "ផ្លាស់ប្តូរ", labelNotes: "មានអ្វីដែលយើងគួរដឹង?", confirm: "បញ្ជាក់ការកក់", confirming: "កំពុងកក់…", bookedTitle: "ការកក់ត្រូវបានបញ្ជាក់", bookedWith: "{meeting} ជាមួយ {brand}",
  emailSubject: "បានបញ្ជាក់: {meeting} ជាមួយ {brand}", emailGreeting: "សួស្តី {name},", emailBooked: "អ្នកបានកក់ {meeting} ជាមួយ {brand} ហើយ។", emailWhen: "ពេលណា: {when}", emailWhere: "នៅឯណា: {where}",
};
const ky: Partial<ProspectStrings> = {
  formThanksTitle: "Рахмат — сиз менен байланышабыз", formThanksBody: "Маалыматыңыз алынды. {brand} тарабынан бирөө жакында байланышат.", formHeading: "{brand} менен байланышуу", formSub: "Маалыматыңызды калтырыңыз, биз байланышабыз.", labelName: "Аты", labelEmail: "Email", labelPhone: "Телефон", labelCompany: "Компания", labelMessage: "Билдирүү", send: "Жөнөтүү",
  bookingHeading: "{brand} менен {meeting} брондоо", minutes: "мүн", timesIn: "{tz} боюнча убакыт", noTimes: "Азыр бош убакыт жок. Жакында кайра текшериңиз.", change: "өзгөртүү", labelNotes: "Биз билүүгө тийиш нерсе барбы?", confirm: "Брондоону ырастоо", confirming: "Брондолууда…", bookedTitle: "Брондоо ырасталды", bookedWith: "{brand} менен {meeting}",
  emailSubject: "Ырасталды: {brand} менен {meeting}", emailGreeting: "Салам, {name}!", emailBooked: "{brand} менен {meeting} үчүн брондолдуңуз.", emailWhen: "Качан: {when}", emailWhere: "Кайда: {where}",
};
const lo: Partial<ProspectStrings> = {
  formThanksTitle: "ຂອບໃຈ — ພວກເຮົາຈະຕິດຕໍ່ຫາ", formThanksBody: "ໄດ້ຮັບຂໍ້ມູນຂອງທ່ານແລ້ວ. ຜູ້ໃດຜູ້ໜຶ່ງຈາກ {brand} ຈະຕິດຕໍ່ໃນໄວໆນີ້.", formHeading: "ຕິດຕໍ່ {brand}", formSub: "ຝາກຂໍ້ມູນຂອງທ່ານໄວ້ ແລ້ວພວກເຮົາຈະຕິດຕໍ່ຫາ.", labelName: "ຊື່", labelEmail: "ອີເມວ", labelPhone: "ໂທລະສັບ", labelCompany: "ບໍລິສັດ", labelMessage: "ຂໍ້ຄວາມ", send: "ສົ່ງ",
  bookingHeading: "ຈອງ {meeting} ກັບ {brand}", minutes: "ນາທີ", timesIn: "ເວລາຕາມ {tz}", noTimes: "ບໍ່ມີເວລາຫວ່າງຕອນນີ້. ກະລຸນາກວດຄືນໃນໄວໆນີ້.", change: "ປ່ຽນ", labelNotes: "ມີຫຍັງທີ່ພວກເຮົາຄວນຮູ້ບໍ?", confirm: "ຢືນຢັນການຈອງ", confirming: "ກຳລັງຈອງ…", bookedTitle: "ການຈອງໄດ້ຮັບການຢືນຢັນ", bookedWith: "{meeting} ກັບ {brand}",
  emailSubject: "ຢືນຢັນແລ້ວ: {meeting} ກັບ {brand}", emailGreeting: "ສະບາຍດີ {name},", emailBooked: "ທ່ານໄດ້ຈອງ {meeting} ກັບ {brand} ແລ້ວ.", emailWhen: "ເມື່ອໃດ: {when}", emailWhere: "ຢູ່ໃສ: {where}",
};
const lv: Partial<ProspectStrings> = {
  formThanksTitle: "Paldies — mēs sazināsimies", formThanksBody: "Jūsu dati ir saņemti. Kāds no {brand} drīz sazināsies.", formHeading: "Sazinieties ar {brand}", formSub: "Atstājiet savus datus, un mēs sazināsimies.", labelName: "Vārds", labelEmail: "E-pasts", labelPhone: "Tālrunis", labelCompany: "Uzņēmums", labelMessage: "Ziņa", send: "Sūtīt",
  bookingHeading: "Rezervējiet {meeting} ar {brand}", minutes: "min", timesIn: "laiki {tz}", noTimes: "Šobrīd nav pieejamu laiku. Ieskatieties drīz vēlreiz.", change: "mainīt", labelNotes: "Kaut kas, kas mums jāzina?", confirm: "Apstiprināt rezervāciju", confirming: "Rezervē…", bookedTitle: "Rezervācija apstiprināta", bookedWith: "{meeting} ar {brand}",
  emailSubject: "Apstiprināts: {meeting} ar {brand}", emailGreeting: "Sveiki, {name}!", emailBooked: "Jums ir rezervēts {meeting} ar {brand}.", emailWhen: "Kad: {when}", emailWhere: "Kur: {where}",
};
const lt: Partial<ProspectStrings> = {
  formThanksTitle: "Ačiū — susisieksime", formThanksBody: "Jūsų duomenys gauti. Kažkas iš {brand} netrukus susisieks.", formHeading: "Susisiekite su {brand}", formSub: "Palikite duomenis ir mes susisieksime.", labelName: "Vardas", labelEmail: "El. paštas", labelPhone: "Telefonas", labelCompany: "Įmonė", labelMessage: "Žinutė", send: "Siųsti",
  bookingHeading: "Rezervuokite {meeting} su {brand}", minutes: "min", timesIn: "laikai {tz}", noTimes: "Šiuo metu laisvų laikų nėra. Netrukus patikrinkite dar kartą.", change: "keisti", labelNotes: "Kažkas, ką turėtume žinoti?", confirm: "Patvirtinti rezervaciją", confirming: "Rezervuojama…", bookedTitle: "Rezervacija patvirtinta", bookedWith: "{meeting} su {brand}",
  emailSubject: "Patvirtinta: {meeting} su {brand}", emailGreeting: "Sveiki, {name},", emailBooked: "Jums rezervuotas {meeting} su {brand}.", emailWhen: "Kada: {when}", emailWhere: "Kur: {where}",
};
const mk: Partial<ProspectStrings> = {
  formThanksTitle: "Благодариме — ќе се јавиме", formThanksBody: "Вашите податоци се примени. Некој од {brand} наскоро ќе се јави.", formHeading: "Контактирајте со {brand}", formSub: "Оставете ги вашите податоци и ќе се јавиме.", labelName: "Име", labelEmail: "Е-пошта", labelPhone: "Телефон", labelCompany: "Компанија", labelMessage: "Порака", send: "Испрати",
  bookingHeading: "Резервирајте {meeting} со {brand}", minutes: "мин", timesIn: "термини во {tz}", noTimes: "Моментално нема слободни термини. Проверете наскоро.", change: "промени", labelNotes: "Нешто што треба да знаеме?", confirm: "Потврди резервација", confirming: "Се резервира…", bookedTitle: "Резервацијата е потврдена", bookedWith: "{meeting} со {brand}",
  emailSubject: "Потврдено: {meeting} со {brand}", emailGreeting: "Здраво {name},", emailBooked: "Резервирани сте за {meeting} со {brand}.", emailWhen: "Кога: {when}", emailWhere: "Каде: {where}",
};
const ml: Partial<ProspectStrings> = {
  formThanksTitle: "നന്ദി — ഞങ്ങൾ ബന്ധപ്പെടും", formThanksBody: "നിങ്ങളുടെ വിവരങ്ങൾ ലഭിച്ചു. {brand}-ൽ നിന്ന് ആരെങ്കിലും ഉടൻ ബന്ധപ്പെടും.", formHeading: "{brand}-നെ ബന്ധപ്പെടുക", formSub: "വിവരങ്ങൾ നൽകൂ, ഞങ്ങൾ ബന്ധപ്പെടാം.", labelName: "പേര്", labelEmail: "ഇമെയിൽ", labelPhone: "ഫോൺ", labelCompany: "കമ്പനി", labelMessage: "സന്ദേശം", send: "അയയ്ക്കുക",
  bookingHeading: "{brand}-നൊപ്പം {meeting} ബുക്ക് ചെയ്യുക", minutes: "മിനിറ്റ്", timesIn: "{tz} പ്രകാരം സമയം", noTimes: "ഇപ്പോൾ സമയം ലഭ്യമല്ല. ഉടൻ വീണ്ടും നോക്കുക.", change: "മാറ്റുക", labelNotes: "ഞങ്ങൾ അറിയേണ്ട എന്തെങ്കിലും?", confirm: "ബുക്കിംഗ് സ്ഥിരീകരിക്കുക", confirming: "ബുക്ക് ചെയ്യുന്നു…", bookedTitle: "ബുക്കിംഗ് സ്ഥിരീകരിച്ചു", bookedWith: "{brand}-നൊപ്പം {meeting}",
  emailSubject: "സ്ഥിരീകരിച്ചു: {brand}-നൊപ്പം {meeting}", emailGreeting: "ഹായ് {name},", emailBooked: "{brand}-നൊപ്പം {meeting}-നായി നിങ്ങൾ ബുക്ക് ചെയ്തിരിക്കുന്നു.", emailWhen: "എപ്പോൾ: {when}", emailWhere: "എവിടെ: {where}",
};
const mr: Partial<ProspectStrings> = {
  formThanksTitle: "धन्यवाद — आम्ही संपर्क करू", formThanksBody: "तुमची माहिती मिळाली. {brand} कडून कोणीतरी लवकरच संपर्क करेल.", formHeading: "{brand} शी संपर्क साधा", formSub: "तुमची माहिती द्या, आम्ही संपर्क करू.", labelName: "नाव", labelEmail: "ईमेल", labelPhone: "फोन", labelCompany: "कंपनी", labelMessage: "संदेश", send: "पाठवा",
  bookingHeading: "{brand} सोबत {meeting} बुक करा", minutes: "मिनिटे", timesIn: "{tz} नुसार वेळा", noTimes: "सध्या वेळ उपलब्ध नाही. लवकरच पुन्हा पहा.", change: "बदला", labelNotes: "आम्हाला माहीत असावे असे काही?", confirm: "बुकिंग निश्चित करा", confirming: "बुक होत आहे…", bookedTitle: "बुकिंग निश्चित झाले", bookedWith: "{brand} सोबत {meeting}",
  emailSubject: "निश्चित: {brand} सोबत {meeting}", emailGreeting: "नमस्कार {name},", emailBooked: "{brand} सोबत {meeting} साठी तुमचे बुकिंग झाले आहे.", emailWhen: "कधी: {when}", emailWhere: "कुठे: {where}",
};
const mn: Partial<ProspectStrings> = {
  formThanksTitle: "Баярлалаа — бид холбогдоно", formThanksBody: "Таны мэдээлэл хүлээн авлаа. {brand}-аас хэн нэгэн удахгүй холбогдоно.", formHeading: "{brand}-тай холбогдох", formSub: "Мэдээллээ үлдээгээрэй, бид холбогдоно.", labelName: "Нэр", labelEmail: "Имэйл", labelPhone: "Утас", labelCompany: "Компани", labelMessage: "Зурвас", send: "Илгээх",
  bookingHeading: "{brand}-тай {meeting} товлох", minutes: "мин", timesIn: "{tz} дахь цагууд", noTimes: "Одоогоор сул цаг алга. Удахгүй дахин шалгана уу.", change: "өөрчлөх", labelNotes: "Бидний мэдэх ёстой зүйл байна уу?", confirm: "Товлолтыг баталгаажуулах", confirming: "Товлож байна…", bookedTitle: "Товлолт баталгаажлаа", bookedWith: "{brand}-тай {meeting}",
  emailSubject: "Баталгаажсан: {brand}-тай {meeting}", emailGreeting: "Сайн байна уу, {name}!", emailBooked: "{brand}-тай {meeting}-д товлогдлоо.", emailWhen: "Хэзээ: {when}", emailWhere: "Хаана: {where}",
};
const ne: Partial<ProspectStrings> = {
  formThanksTitle: "धन्यवाद — हामी सम्पर्क गर्नेछौं", formThanksBody: "तपाईंको विवरण प्राप्त भयो। {brand} बाट कसैले चाँडै सम्पर्क गर्नेछ।", formHeading: "{brand} लाई सम्पर्क गर्नुहोस्", formSub: "आफ्नो विवरण छोड्नुहोस्, हामी सम्पर्क गर्नेछौं।", labelName: "नाम", labelEmail: "इमेल", labelPhone: "फोन", labelCompany: "कम्पनी", labelMessage: "सन्देश", send: "पठाउनुहोस्",
  bookingHeading: "{brand} सँग {meeting} बुक गर्नुहोस्", minutes: "मिनेट", timesIn: "{tz} अनुसार समय", noTimes: "अहिले कुनै समय उपलब्ध छैन। चाँडै फेरि हेर्नुहोस्।", change: "परिवर्तन", labelNotes: "हामीले जान्नुपर्ने केही?", confirm: "बुकिङ पुष्टि गर्नुहोस्", confirming: "बुक हुँदैछ…", bookedTitle: "बुकिङ पुष्टि भयो", bookedWith: "{brand} सँग {meeting}",
  emailSubject: "पुष्टि भयो: {brand} सँग {meeting}", emailGreeting: "नमस्ते {name},", emailBooked: "{brand} सँग {meeting} का लागि तपाईंको बुकिङ भयो।", emailWhen: "कहिले: {when}", emailWhere: "कहाँ: {where}",
};
const ps: Partial<ProspectStrings> = {
  dir: "rtl",
  formThanksTitle: "مننه — ژر به اړیکه ونیسو", formThanksBody: "ستاسو معلومات ترلاسه شول. د {brand} څخه به یو څوک ژر اړیکه ونیسي.", formHeading: "له {brand} سره اړیکه ونیسئ", formSub: "خپل معلومات پرېږدئ، موږ به اړیکه ونیسو.", labelName: "نوم", labelEmail: "بریښنالیک", labelPhone: "تلیفون", labelCompany: "شرکت", labelMessage: "پیغام", send: "ولېږئ",
  bookingHeading: "له {brand} سره {meeting} ونیسئ", minutes: "دقیقې", timesIn: "وختونه په {tz}", noTimes: "اوس مهال وخت نشته. ژر بیا وګورئ.", change: "بدلول", labelNotes: "کوم څه چې موږ یې باید پوه شو؟", confirm: "ملاقات تایید کړئ", confirming: "نیول کېږي…", bookedTitle: "ملاقات تایید شو", bookedWith: "{meeting} له {brand} سره",
  emailSubject: "تایید شو: {meeting} له {brand} سره", emailGreeting: "سلام {name}،", emailBooked: "تاسو له {brand} سره د {meeting} لپاره ثبت شوي یاست.", emailWhen: "کله: {when}", emailWhere: "چېرته: {where}",
};
const fa: Partial<ProspectStrings> = {
  dir: "rtl",
  formThanksTitle: "متشکریم — به‌زودی تماس می‌گیریم", formThanksBody: "اطلاعات شما دریافت شد. کسی از {brand} به‌زودی تماس می‌گیرد.", formHeading: "تماس با {brand}", formSub: "اطلاعات خود را بگذارید تا تماس بگیریم.", labelName: "نام", labelEmail: "ایمیل", labelPhone: "تلفن", labelCompany: "شرکت", labelMessage: "پیام", send: "ارسال",
  bookingHeading: "رزرو {meeting} با {brand}", minutes: "دقیقه", timesIn: "زمان‌ها به وقت {tz}", noTimes: "در حال حاضر زمانی خالی نیست. به‌زودی دوباره سر بزنید.", change: "تغییر", labelNotes: "چیزی هست که باید بدانیم؟", confirm: "تأیید رزرو", confirming: "در حال رزرو…", bookedTitle: "رزرو تأیید شد", bookedWith: "{meeting} با {brand}",
  emailSubject: "تأیید شد: {meeting} با {brand}", emailGreeting: "سلام {name}،", emailBooked: "برای {meeting} با {brand} رزرو شده‌اید.", emailWhen: "چه زمانی: {when}", emailWhere: "کجا: {where}",
};
const pa: Partial<ProspectStrings> = {
  formThanksTitle: "ਧੰਨਵਾਦ — ਅਸੀਂ ਸੰਪਰਕ ਕਰਾਂਗੇ", formThanksBody: "ਤੁਹਾਡੇ ਵੇਰਵੇ ਮਿਲ ਗਏ ਹਨ। {brand} ਤੋਂ ਕੋਈ ਜਲਦੀ ਸੰਪਰਕ ਕਰੇਗਾ।", formHeading: "{brand} ਨਾਲ ਸੰਪਰਕ ਕਰੋ", formSub: "ਆਪਣੇ ਵੇਰਵੇ ਛੱਡੋ, ਅਸੀਂ ਸੰਪਰਕ ਕਰਾਂਗੇ।", labelName: "ਨਾਮ", labelEmail: "ਈਮੇਲ", labelPhone: "ਫ਼ੋਨ", labelCompany: "ਕੰਪਨੀ", labelMessage: "ਸੁਨੇਹਾ", send: "ਭੇਜੋ",
  bookingHeading: "{brand} ਨਾਲ {meeting} ਬੁੱਕ ਕਰੋ", minutes: "ਮਿੰਟ", timesIn: "{tz} ਅਨੁਸਾਰ ਸਮਾਂ", noTimes: "ਇਸ ਵੇਲੇ ਕੋਈ ਸਮਾਂ ਉਪਲਬਧ ਨਹੀਂ। ਜਲਦੀ ਫਿਰ ਵੇਖੋ।", change: "ਬਦਲੋ", labelNotes: "ਕੁਝ ਜੋ ਸਾਨੂੰ ਪਤਾ ਹੋਣਾ ਚਾਹੀਦਾ?", confirm: "ਬੁਕਿੰਗ ਪੱਕੀ ਕਰੋ", confirming: "ਬੁੱਕ ਹੋ ਰਿਹਾ…", bookedTitle: "ਬੁਕਿੰਗ ਪੱਕੀ ਹੋ ਗਈ", bookedWith: "{brand} ਨਾਲ {meeting}",
  emailSubject: "ਪੱਕਾ: {brand} ਨਾਲ {meeting}", emailGreeting: "ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name},", emailBooked: "{brand} ਨਾਲ {meeting} ਲਈ ਤੁਹਾਡੀ ਬੁਕਿੰਗ ਹੋ ਗਈ ਹੈ।", emailWhen: "ਕਦੋਂ: {when}", emailWhere: "ਕਿੱਥੇ: {where}",
};
const sr: Partial<ProspectStrings> = {
  formThanksTitle: "Хвала — јавићемо се", formThanksBody: "Ваши подаци су примљени. Неко из {brand} ће се ускоро јавити.", formHeading: "Контактирајте {brand}", formSub: "Оставите податке и јавићемо се.", labelName: "Име", labelEmail: "Имејл", labelPhone: "Телефон", labelCompany: "Компанија", labelMessage: "Порука", send: "Пошаљи",
  bookingHeading: "Резервишите {meeting} са {brand}", minutes: "мин", timesIn: "термини у {tz}", noTimes: "Тренутно нема слободних термина. Проверите ускоро.", change: "промени", labelNotes: "Нешто што треба да знамо?", confirm: "Потврди резервацију", confirming: "Резервишем…", bookedTitle: "Резервација потврђена", bookedWith: "{meeting} са {brand}",
  emailSubject: "Потврђено: {meeting} са {brand}", emailGreeting: "Здраво {name},", emailBooked: "Резервисани сте за {meeting} са {brand}.", emailWhen: "Када: {when}", emailWhere: "Где: {where}",
};
const si: Partial<ProspectStrings> = {
  formThanksTitle: "ස්තුතියි — අපි සම්බන්ධ වෙමු", formThanksBody: "ඔබේ තොරතුරු ලැබී ඇත. {brand} වෙතින් කෙනෙක් ඉක්මනින් සම්බන්ධ වේ.", formHeading: "{brand} අමතන්න", formSub: "ඔබේ තොරතුරු තබන්න, අපි සම්බන්ධ වෙමු.", labelName: "නම", labelEmail: "ඊමේල්", labelPhone: "දුරකථනය", labelCompany: "සමාගම", labelMessage: "පණිවිඩය", send: "යවන්න",
  bookingHeading: "{brand} සමඟ {meeting} වෙන් කරන්න", minutes: "මිනි", timesIn: "{tz} අනුව වේලාවන්", noTimes: "දැනට වේලාවන් නොමැත. ඉක්මනින් නැවත බලන්න.", change: "වෙනස් කරන්න", labelNotes: "අප දැනගත යුතු දෙයක්?", confirm: "වෙන්කිරීම තහවුරු කරන්න", confirming: "වෙන් කරමින්…", bookedTitle: "වෙන්කිරීම තහවුරු විය", bookedWith: "{brand} සමඟ {meeting}",
  emailSubject: "තහවුරුයි: {brand} සමඟ {meeting}", emailGreeting: "ආයුබෝවන් {name},", emailBooked: "{brand} සමඟ {meeting} සඳහා ඔබ වෙන් වී ඇත.", emailWhen: "කවදාද: {when}", emailWhere: "කොහේද: {where}",
};
const sl: Partial<ProspectStrings> = {
  formThanksTitle: "Hvala — oglasili se bomo", formThanksBody: "Vaše podatke smo prejeli. Nekdo iz {brand} se bo kmalu oglasil.", formHeading: "Kontaktirajte {brand}", formSub: "Pustite podatke in se oglasimo.", labelName: "Ime", labelEmail: "E-pošta", labelPhone: "Telefon", labelCompany: "Podjetje", labelMessage: "Sporočilo", send: "Pošlji",
  bookingHeading: "Rezervirajte {meeting} z {brand}", minutes: "min", timesIn: "termini v {tz}", noTimes: "Trenutno ni prostih terminov. Preverite kmalu.", change: "spremeni", labelNotes: "Kaj, kar bi morali vedeti?", confirm: "Potrdi rezervacijo", confirming: "Rezerviram…", bookedTitle: "Rezervacija potrjena", bookedWith: "{meeting} z {brand}",
  emailSubject: "Potrjeno: {meeting} z {brand}", emailGreeting: "Pozdravljeni, {name},", emailBooked: "Rezervirani ste za {meeting} z {brand}.", emailWhen: "Kdaj: {when}", emailWhere: "Kje: {where}",
};
const so: Partial<ProspectStrings> = {
  formThanksTitle: "Mahadsanid — waan kula soo xiriiri doonnaa", formThanksBody: "Xogtaadii waa la helay. Qof ka socda {brand} ayaa dhawaan kula soo xiriiri doona.", formHeading: "La xiriir {brand}", formSub: "Xogtaada nagu reeb, waan kula soo xiriiri doonnaa.", labelName: "Magac", labelEmail: "Iimayl", labelPhone: "Telefoon", labelCompany: "Shirkad", labelMessage: "Fariin", send: "Dir",
  bookingHeading: "Ballanso {meeting} la {brand}", minutes: "daq", timesIn: "waqtiyada {tz}", noTimes: "Hadda waqti banaan ma jiro. Dhawaan mar kale hubi.", change: "beddel", labelNotes: "Wax aan ogaan lahayn ma jiraa?", confirm: "Xaqiiji ballanta", confirming: "Waa la ballansanayaa…", bookedTitle: "Ballanta waa la xaqiijiyay", bookedWith: "{meeting} la {brand}",
  emailSubject: "La xaqiijiyay: {meeting} la {brand}", emailGreeting: "Salaan {name},", emailBooked: "Waxaa laguu ballansaday {meeting} la {brand}.", emailWhen: "Goorma: {when}", emailWhere: "Xaggee: {where}",
};
const sw: Partial<ProspectStrings> = {
  formThanksTitle: "Asante — tutawasiliana nawe", formThanksBody: "Taarifa zako zimepokelewa. Mtu kutoka {brand} atawasiliana hivi karibuni.", formHeading: "Wasiliana na {brand}", formSub: "Acha taarifa zako na tutawasiliana.", labelName: "Jina", labelEmail: "Barua pepe", labelPhone: "Simu", labelCompany: "Kampuni", labelMessage: "Ujumbe", send: "Tuma",
  bookingHeading: "Weka {meeting} na {brand}", minutes: "dak", timesIn: "nyakati kwa {tz}", noTimes: "Hakuna nyakati zilizopo kwa sasa. Angalia tena hivi karibuni.", change: "badilisha", labelNotes: "Kitu tunachopaswa kujua?", confirm: "Thibitisha miadi", confirming: "Inawekwa…", bookedTitle: "Miadi imethibitishwa", bookedWith: "{meeting} na {brand}",
  emailSubject: "Imethibitishwa: {meeting} na {brand}", emailGreeting: "Habari {name},", emailBooked: "Umewekewa {meeting} na {brand}.", emailWhen: "Lini: {when}", emailWhere: "Wapi: {where}",
};
const te: Partial<ProspectStrings> = {
  formThanksTitle: "ధన్యవాదాలు — మేము సంప్రదిస్తాము", formThanksBody: "మీ వివరాలు అందాయి. {brand} నుండి ఎవరైనా త్వరలో సంప్రదిస్తారు.", formHeading: "{brand} ని సంప్రదించండి", formSub: "మీ వివరాలు ఇవ్వండి, మేము సంప్రదిస్తాము.", labelName: "పేరు", labelEmail: "ఇమెయిల్", labelPhone: "ఫోన్", labelCompany: "కంపెనీ", labelMessage: "సందేశం", send: "పంపండి",
  bookingHeading: "{brand} తో {meeting} బుక్ చేయండి", minutes: "నిమి", timesIn: "{tz} ప్రకారం సమయాలు", noTimes: "ప్రస్తుతం సమయాలు అందుబాటులో లేవు. త్వరలో మళ్లీ చూడండి.", change: "మార్చండి", labelNotes: "మేము తెలుసుకోవాల్సినది ఏదైనా?", confirm: "బుకింగ్ నిర్ధారించండి", confirming: "బుక్ అవుతోంది…", bookedTitle: "బుకింగ్ నిర్ధారించబడింది", bookedWith: "{brand} తో {meeting}",
  emailSubject: "నిర్ధారించబడింది: {brand} తో {meeting}", emailGreeting: "హాయ్ {name},", emailBooked: "{brand} తో {meeting} కోసం మీ బుకింగ్ జరిగింది.", emailWhen: "ఎప్పుడు: {when}", emailWhere: "ఎక్కడ: {where}",
};
const th: Partial<ProspectStrings> = {
  formThanksTitle: "ขอบคุณ — เราจะติดต่อกลับ", formThanksBody: "ได้รับข้อมูลของคุณแล้ว จะมีคนจาก {brand} ติดต่อกลับเร็วๆ นี้", formHeading: "ติดต่อ {brand}", formSub: "ฝากข้อมูลไว้ แล้วเราจะติดต่อกลับ", labelName: "ชื่อ", labelEmail: "อีเมล", labelPhone: "โทรศัพท์", labelCompany: "บริษัท", labelMessage: "ข้อความ", send: "ส่ง",
  bookingHeading: "จอง {meeting} กับ {brand}", minutes: "นาที", timesIn: "เวลาตาม {tz}", noTimes: "ขณะนี้ไม่มีเวลาว่าง โปรดกลับมาดูใหม่เร็วๆ นี้", change: "เปลี่ยน", labelNotes: "มีอะไรที่เราควรรู้ไหม?", confirm: "ยืนยันการจอง", confirming: "กำลังจอง…", bookedTitle: "ยืนยันการจองแล้ว", bookedWith: "{meeting} กับ {brand}",
  emailSubject: "ยืนยันแล้ว: {meeting} กับ {brand}", emailGreeting: "สวัสดี {name}", emailBooked: "คุณได้จอง {meeting} กับ {brand} แล้ว", emailWhen: "เมื่อไหร่: {when}", emailWhere: "ที่ไหน: {where}",
};
const ur: Partial<ProspectStrings> = {
  dir: "rtl",
  formThanksTitle: "شکریہ — ہم جلد رابطہ کریں گے", formThanksBody: "آپ کی معلومات موصول ہو گئیں۔ {brand} سے کوئی جلد رابطہ کرے گا۔", formHeading: "{brand} سے رابطہ کریں", formSub: "اپنی معلومات چھوڑیں، ہم رابطہ کریں گے۔", labelName: "نام", labelEmail: "ای میل", labelPhone: "فون", labelCompany: "کمپنی", labelMessage: "پیغام", send: "بھیجیں",
  bookingHeading: "{brand} کے ساتھ {meeting} بک کریں", minutes: "منٹ", timesIn: "{tz} کے مطابق اوقات", noTimes: "فی الحال کوئی وقت دستیاب نہیں۔ جلد دوبارہ دیکھیں۔", change: "تبدیل کریں", labelNotes: "کچھ جو ہمیں معلوم ہونا چاہیے؟", confirm: "بکنگ کی تصدیق کریں", confirming: "بک ہو رہی ہے…", bookedTitle: "بکنگ کی تصدیق ہو گئی", bookedWith: "{brand} کے ساتھ {meeting}",
  emailSubject: "تصدیق شدہ: {brand} کے ساتھ {meeting}", emailGreeting: "سلام {name}،", emailBooked: "{brand} کے ساتھ {meeting} کے لیے آپ کی بکنگ ہو گئی ہے۔", emailWhen: "کب: {when}", emailWhere: "کہاں: {where}",
};
const uz: Partial<ProspectStrings> = {
  formThanksTitle: "Rahmat — siz bilan bog'lanamiz", formThanksBody: "Ma'lumotlaringiz qabul qilindi. {brand} jamoasidan kimdir tez orada bog'lanadi.", formHeading: "{brand} bilan bog'lanish", formSub: "Ma'lumotlaringizni qoldiring, biz bog'lanamiz.", labelName: "Ism", labelEmail: "Email", labelPhone: "Telefon", labelCompany: "Kompaniya", labelMessage: "Xabar", send: "Yuborish",
  bookingHeading: "{brand} bilan {meeting} band qilish", minutes: "daq", timesIn: "{tz} bo'yicha vaqtlar", noTimes: "Hozircha bo'sh vaqt yo'q. Tez orada yana tekshiring.", change: "o'zgartirish", labelNotes: "Biz bilishimiz kerak bo'lgan narsa bormi?", confirm: "Bandni tasdiqlash", confirming: "Band qilinmoqda…", bookedTitle: "Band tasdiqlandi", bookedWith: "{brand} bilan {meeting}",
  emailSubject: "Tasdiqlandi: {brand} bilan {meeting}", emailGreeting: "Salom {name},", emailBooked: "{brand} bilan {meeting} uchun band qilindingiz.", emailWhen: "Qachon: {when}", emailWhere: "Qayerda: {where}",
};
const cy: Partial<ProspectStrings> = {
  formThanksTitle: "Diolch — byddwn mewn cysylltiad", formThanksBody: "Mae eich manylion wedi cyrraedd. Bydd rhywun o {brand} yn cysylltu cyn bo hir.", formHeading: "Cysylltwch â {brand}", formSub: "Gadewch eich manylion a byddwn yn cysylltu.", labelName: "Enw", labelEmail: "E-bost", labelPhone: "Ffôn", labelCompany: "Cwmni", labelMessage: "Neges", send: "Anfon",
  bookingHeading: "Archebwch {meeting} gyda {brand}", minutes: "mun", timesIn: "amseroedd yn {tz}", noTimes: "Dim amseroedd ar gael ar hyn o bryd. Edrychwch eto'n fuan.", change: "newid", labelNotes: "Unrhyw beth y dylem ei wybod?", confirm: "Cadarnhau'r archeb", confirming: "Yn archebu…", bookedTitle: "Archeb wedi'i chadarnhau", bookedWith: "{meeting} gyda {brand}",
  emailSubject: "Wedi'i gadarnhau: {meeting} gyda {brand}", emailGreeting: "Helo {name},", emailBooked: "Rydych wedi'ch archebu ar gyfer {meeting} gyda {brand}.", emailWhen: "Pryd: {when}", emailWhere: "Ble: {where}",
};

const CATALOGS: Record<string, Partial<ProspectStrings>> = {
  es, fr, de, pt, it, nl, pl, ja, zh, ko, ar, hi,
  bg, hr, cs, da, tl, fi, el, hu, id, ms, no, ro, ru, sk, sv, ta, tr, uk, vi,
  af, sq, am, hy, az, be, bn, bs, my, ca, et, ka, gu, ha, he, is, ga, jv, kn, kk, km, ky, lo, lv, lt, mk, ml, mr, mn, ne, ps, fa, pa, sr, si, sl, so, sw, te, th, ur, uz, cy,
};

/** The strings for an org's selling language; unknown codes fall back to English. */
export function prospectStrings(lang?: string | null): ProspectStrings {
  const code = getLanguage(lang).code;
  const overlay = CATALOGS[code];
  return overlay ? { ...en, ...overlay } : en;
}

/** Resolve {tokens} in a template, e.g. fill(s.formHeading, { brand }). Unknown
 *  tokens stay visible (mirrors templates-fill's philosophy). */
export function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z]+)\}/gi, (raw, key: string) => vars[key] ?? raw);
}

/** Test-only: the complete English base, for key-coverage assertions. */
export const _EN = en;
