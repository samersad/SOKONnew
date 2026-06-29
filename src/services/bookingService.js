import apiClient, { emitStoreChange, getStoredUser } from './apiClient';
import { mapApartment } from './apartmentService';
import { mapUser } from './userService';

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  return value?.bookings || value?.data?.bookings || value?.data || value?.items || [];
};

const normalizeStatus = (status) => {
  const value = `${status || 'pending'}`.trim().toLowerCase();
  // Standardizing statuses for UI labels: Pending, Accepted, Rejected, Cancelled
  if (value === 'accepted' || value === 'approved') return 'accepted';
  if (value === 'rejected' || value === 'declined') return 'rejected';
  if (value === 'canceled' || value === 'cancelled') return 'cancelled';
  return value;
};

const normalizeDate = (value) => {
  if (!value) return '';
  // Handle ISO strings, timestamps, or date objects
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return value; // Return raw if invalid but exists
    return date.toLocaleDateString();
  } catch (e) {
    return value;
  }
};

export const mapBooking = (booking) => {
  if (!booking) return null;

  const b = booking;

  // 1. Resilient Apartment Mapping
  const aptData = b.apartment || {};
  const apartmentId = b.apartmentId || b.apartment_id || aptData._id || aptData.id || '';
  const apartmentName = b.apartmentName || b.apartment_name || b.apartmentTitle || aptData.title || aptData.name || 'Apartment';
  const apartmentAddress = b.apartmentAddress || b.apartment_address || b.address || aptData.address || '';
  
  const apartmentImage = 
    b.apartmentImage || 
    b.apartment_image || 
    b.apartmentImageUrl ||
    b.image || 
    b.image_url ||
    (Array.isArray(aptData.images) && aptData.images[0]) || 
    aptData.image || 
    aptData.imageUrl ||
    aptData.photo ||
    '';

  const apartment = mapApartment({
    ...aptData,
    _id: apartmentId,
    id: apartmentId,
    title: apartmentName,
    address: apartmentAddress,
    images: (Array.isArray(aptData.images) && aptData.images.length > 0) 
      ? aptData.images 
      : (apartmentImage ? [apartmentImage] : []),
  });

  // 2. Resilient Student/Client Mapping
  const stuData = b.student || b.client || b.user || {};
  
  const studentId = 
    b.clientId || 
    b.client_id || 
    b.studentId || 
    b.student_id || 
    b.userId || 
    b.user_id || 
    stuData._id || 
    stuData.id || 
    '';

  const studentName = 
    b.studentName || 
    b.student_name || 
    b.clientName || 
    b.client_name || 
    b.userName || 
    b.user_name || 
    b.fullName || 
    b.name || 
    stuData.fullName || 
    stuData.name || 
    'Student';

  const studentAvatar = 
    b.studentPhoto || 
    b.student_photo || 
    b.clientPhoto || 
    b.client_photo || 
    b.studentImage || 
    b.student_image || 
    b.avatar || 
    b.photoUrl || 
    stuData.avatar || 
    stuData.photoUrl || 
    '';

  const studentFaculty = 
    b.studentFaculty || 
    b.student_faculty ||
    b.clientFaculty ||
    b.client_faculty ||
    b.faculty || 
    b.college || 
    b.student_college ||
    b.client_college ||
    stuData.faculty || 
    stuData.college || 
    stuData.studentFaculty ||
    stuData.student_faculty ||
    stuData.studentCollege ||
    stuData.student_college ||
    '';

  const student = mapUser({
    ...stuData,
    _id: studentId,
    id: studentId,
    fullName: studentName,
    name: studentName,
    email: b.studentEmail || b.student_email || b.clientEmail || b.client_email || b.email || stuData.email || '',
    phone: b.studentPhone || b.student_phone || b.clientPhone || b.client_phone || b.phone || b.phoneNumber || stuData.phone || stuData.phoneNumber || '',
    avatar: studentAvatar,
    photoUrl: studentAvatar,
    faculty: studentFaculty,
    college: studentFaculty,
  });

  const bId = b.id || b._id || '';

  return {
    ...booking,
    _id: booking.id || booking._id || booking.bookingId || booking.booking_id || '',
    id: booking.id || booking._id || booking.bookingId || booking.booking_id || '',
    apartmentId: booking.apartmentId || booking.apartment?._id || booking.apartment?.id || '',
    ownerId: booking.ownerId || booking.apartment?.owner?._id || booking.apartment?.owner?.id || '',
    clientId: booking.clientId || student?._id || student?.id || '',
    status: normalizeStatus(booking.status),
    checkInDate: normalizeDate(booking.checkInDate || booking.startDate || booking.start_date),
    checkOutDate: normalizeDate(booking.checkOutDate || booking.endDate || booking.end_date),
    requestedOccupants: Number(booking.requestedOccupants || booking.people_count || booking.peopleCount || 1),
    rating: Number(booking.rating || 0),
    ratedAt: booking.ratedAt || booking.rated_at || '',
    message: booking.message || booking.note || booking.notes || '',
    createdAt: booking.createdAt || booking.created_at || booking.timestamp || '',
    apartment,
    student,
  };
};

const normalizeBookingList = (payload) => asArray(payload).map(mapBooking).filter(Boolean);

export const bookingsAPI = {
  checkActiveBooking: async (userId, apartmentId) => {
    try {
      const response = await apiClient.get('/bookings/active/check', {
        params: { userId, apartmentId }
      });
      return response.data;
    } catch (error) {
      const res = await bookingsAPI.getStudentBookings(userId);
      const list = res.data?.bookings || [];
      const exists = list.some(b => 
        String(b.apartmentId) === String(apartmentId) && 
        ['pending', 'approved', 'accepted', 'confirmed'].includes(b.status)
      );
      return { exists };
    }
  },

  createBooking: async (data) => {
    const payload = {
      apartmentId: data.apartmentId,
      apartmentName: data.apartmentName,
      apartmentAddress: data.apartmentAddress,
      apartmentImage: data.apartmentImage,
      ownerId: data.ownerId,
      ownerName: data.ownerName,
      startDate: data.startDate,
      endDate: data.endDate,
      totalPrice: Number(data.totalPrice),
      people_count: Number(data.people_count),
      status: "pending"
    };

    const response = await apiClient.post('/bookings', payload);
    const bookingData = response.data?.booking || response.data;
    const bookingId = bookingData?._id || bookingData?.id;

    if (bookingId && data.ownerId) {
      try {
        await apiClient.post('/functions/send-booking-notification', {
          ownerId: data.ownerId,
          bookingId: bookingId,
          title: "New Booking Request",
          body: "You have received a new booking request",
          type: "new_booking"
        });
      } catch (err) {}
    }

    emitStoreChange();
    return { data: mapBooking(bookingData) };
  },

  getStudentBookings: async (userId = getStoredUser()?.id || getStoredUser()?._id) => {
    const response = await apiClient.get('/bookings', { params: { clientId: userId } });
    return { data: { bookings: normalizeBookingList(response.data) } };
  },

  getOwnerBookings: async (ownerId = getStoredUser()?.id || getStoredUser()?._id) => {
    const response = await apiClient.get('/bookings', { params: { ownerId: ownerId } });
    return { data: { bookings: normalizeBookingList(response.data) } };
  },

  updateBookingStatusWithCapacity: async ({ bookingId, status }) => {
    const response = await apiClient.post('/rpc/update_booking_status_with_capacity', {
      p_booking_id: bookingId,
      p_status: status,
    });
    emitStoreChange();
    return { data: mapBooking(response.data?.booking || response.data) };
  },

  rateBooking: async ({ bookingId, rating }) => {
    const response = await apiClient.post(`/bookings/${bookingId}/rating`, {
      rating: Number(rating),
    });
    emitStoreChange();
    return { data: mapBooking(response.data?.booking || response.data) };
  },

  acceptBooking: async (id) => {
    const response = await apiClient.post(`/bookings/${id}/status`, { status: 'accepted' });
    emitStoreChange();
    return response;
  },

  rejectBooking: async (id) => {
    const response = await apiClient.post(`/bookings/${id}/status`, { status: 'rejected' });
    emitStoreChange();
    return response;
  },

  cancelBooking: async (id) => bookingsAPI.updateBookingStatusWithCapacity({ bookingId: id, status: 'cancelled' }),
};

export { normalizeBookingList };
