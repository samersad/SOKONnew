import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { apiClient, bookingsAPI, getApiErrorMessage } from '../services/api';
import { useStoreVersion } from '../hooks/useStoreVersion';
import { useAuth } from '../context/AuthContext';
import { APARTMENT_PLACEHOLDER } from '../utils/placeholders';

const statusStyles = {
  pending: 'bg-amber-100 text-amber-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  approved: 'bg-emerald-100 text-emerald-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-rose-100 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-600',
  completed: 'bg-blue-100 text-blue-700',
};

export const MyBookings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const storeVersion = useStoreVersion();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingRatingId, setSavingRatingId] = useState('');
  const [ratingError, setRatingError] = useState({ bookingId: '', message: '' });

  useEffect(() => {
    const loadBookings = async () => {
      const userId = user?._id || user?.id;
      if (!userId) {
        setBookings([]);
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const response = await bookingsAPI.getStudentBookings(userId);
        const data = response.data?.bookings || response.data || [];
        // Sort newest first
        setBookings(data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      } catch (error) {
        console.error('Error fetching bookings:', error);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, [user?._id, user?.id, storeVersion]);

  const totals = useMemo(() => ({
    total: bookings.length,
    pending: bookings.filter((b) => b.status === 'pending').length,
    approved: bookings.filter((b) => ['accepted', 'approved', 'confirmed'].includes(b.status)).length,
  }), [bookings]);

  const handleCancelBooking = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this booking request?')) return;

    try {
      await bookingsAPI.cancelBooking(id);
      // Local update
      setBookings(prev => prev.map(b => b._id === id ? { ...b, status: 'cancelled' } : b));
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    }
  };

  const canRateBooking = (booking) => (
    Boolean(booking?._id || booking?.id) &&
    ['accepted', 'approved', 'confirmed', 'completed'].includes(booking.status)
  );

  const handleRateBooking = async (booking, rating) => {
    const bookingId = booking?._id || booking?.id;

    if (!bookingId || savingRatingId) {
      return;
    }

    setSavingRatingId(bookingId);
    setRatingError({ bookingId: '', message: '' });

    try {
      const response = await apiClient.post(`/bookings/${bookingId}/rating`, {
        rating: Number(rating),
      });
      const updatedBooking = response.data?.booking || response.data?.data?.booking || response.data;

      setBookings((currentBookings) =>
        currentBookings.map((item) =>
          (item._id || item.id) === bookingId
            ? {
                ...item,
                ...updatedBooking,
                rating,
                ratedAt: updatedBooking?.ratedAt || updatedBooking?.rated_at || new Date().toISOString(),
              }
            : item,
        ),
      );
    } catch (error) {
      console.error('Error rating booking:', error);
      setRatingError({
        bookingId,
        message: getApiErrorMessage(error, 'Failed to save rating.'),
      });
    } finally {
      setSavingRatingId('');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Navbar />

      <div className="px-4 pt-8">
        <div className="mx-auto max-w-7xl rounded-[32px] border border-slate-200 bg-white px-8 py-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                Student Workspace
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
                My Bookings
              </h1>
              <p className="mt-2 max-w-2xl text-slate-500 font-medium text-lg">
                Track your rental requests, approvals, and housing history.
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/apartments')}
              className="rounded-2xl bg-primary px-8 py-4 font-black text-white transition hover:opacity-90 shadow-lg shadow-primary/20"
            >
              Search Apartments
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <StatBox label="Total Requests" value={totals.total} color="text-slate-900" />
          <StatBox label="Pending" value={totals.pending} color="text-amber-600" />
          <StatBox label="Approved" value={totals.approved} color="text-emerald-600" />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-20">
        <h2 className="mb-8 text-2xl font-black text-slate-900 flex items-center gap-3">
           <i className="fas fa-history text-slate-300"></i>
           Booking History
        </h2>

        {loading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-64 bg-white rounded-[32px] animate-pulse border border-slate-100 shadow-sm"></div>
            ))}
          </div>
        ) : bookings.length > 0 ? (
          <div className="space-y-6">
            {bookings.map((booking) => {
              const style = statusStyles[booking.status] || statusStyles.pending;
              const apartment = booking.apartment || {};

              return (
                <div key={booking._id} className="overflow-hidden rounded-[32px] bg-white shadow-sm border border-slate-100">
                  <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                    <div className="h-64 bg-slate-200 md:h-full relative overflow-hidden">
                      <img
                        src={apartment.images?.[0] || booking.apartmentImage || booking.apartment_image || APARTMENT_PLACEHOLDER}
                        alt={apartment.title || booking.apartmentName || 'Apartment'}
                        className="h-full w-full object-cover transition transform hover:scale-105 duration-700"
                      />
                      <div className="absolute top-4 left-4">
                         <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-lg ${style}`}>
                           {booking.status}
                         </span>
                      </div>
                    </div>

                    <div className="p-8">
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-2xl font-black text-slate-900 truncate">
                            {apartment.title || booking.apartmentName}
                          </h3>

                          <p className="mt-2 text-slate-500 font-bold flex items-center gap-2">
                            <i className="fas fa-location-dot text-primary"></i>
                            {apartment.district || booking.apartmentAddress}
                          </p>

                          {booking.message && (
                             <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <p className="text-sm text-slate-600 italic">"{booking.message}"</p>
                             </div>
                          )}

                          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <InfoTile label="Start Date" value={booking.startDate} icon="fa-calendar-check" />
                            <InfoTile label="End Date" value={booking.endDate} icon="fa-calendar-day" />
                            <InfoTile label="Occupants" value={`${booking.people_count} Person`} icon="fa-users" />
                            <InfoTile label="Total Price" value={`$${booking.totalPrice}`} icon="fa-tag" highlight />
                          </div>
                        </div>

                        <div className="lg:w-48 shrink-0 space-y-3">
                           <button
                             onClick={() => navigate(`/apartment/${apartment._id || booking.apartmentId}`)}
                             className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition shadow-sm"
                           >
                             View Apartment
                           </button>

                           {['pending', 'accepted', 'approved'].includes(booking.status) && (
                             <button
                               onClick={() => handleCancelBooking(booking._id)}
                               className="w-full py-3 rounded-2xl bg-rose-50 text-rose-600 text-sm font-bold hover:bg-rose-100 transition"
                             >
                               Cancel Stay
                             </button>
                           )}
                        </div>
                      </div>

                      {canRateBooking(booking) && (
                        <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">
                                {booking.rating > 0 ? 'Your rating' : 'Rate your stay'}
                              </p>
                              {booking.ratedAt && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Saved {new Date(booking.ratedAt).toLocaleDateString()}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((rating) => {
                                const isSelected = rating <= Number(booking.rating || 0);
                                const isSaving = savingRatingId === (booking._id || booking.id);

                                return (
                                  <button
                                    key={rating}
                                    type="button"
                                    onClick={() => handleRateBooking(booking, rating)}
                                    disabled={isSaving}
                                    aria-label={`Rate ${rating} star${rating === 1 ? '' : 's'}`}
                                    className={`h-10 w-10 rounded-full text-xl transition ${
                                      isSelected
                                        ? 'text-amber-400 hover:text-amber-500'
                                        : 'text-slate-300 hover:text-amber-400'
                                    } disabled:cursor-wait disabled:opacity-60`}
                                  >
                                    <i className={`${isSelected ? 'fa-solid' : 'fa-regular'} fa-star`}></i>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {savingRatingId === (booking._id || booking.id) && (
                            <p className="mt-3 text-sm font-semibold text-slate-500">Saving rating...</p>
                          )}
                          {ratingError.bookingId === (booking._id || booking.id) && ratingError.message && (
                            <p className="mt-3 text-sm font-semibold text-rose-600">{ratingError.message}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[40px] bg-white py-24 text-center shadow-sm border border-slate-100">
            <div className="h-24 w-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8">
               <i className="fas fa-calendar-xmark text-4xl text-slate-200"></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">No active bookings</h3>
            <p className="text-slate-400 font-medium">You haven't made any housing requests yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const StatBox = ({ label, value, color }) => (
  <div className="rounded-[28px] bg-white p-6 border border-slate-100 shadow-sm">
    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className={`mt-2 text-4xl font-black ${color}`}>{value}</p>
  </div>
);

const InfoTile = ({ label, value, icon, highlight }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
       <i className={`fas ${icon} text-[12px]`}></i>
       {label}
    </span>
    <span className={`text-sm font-bold ${highlight ? 'text-primary' : 'text-slate-900'}`}>{value}</span>
  </div>
);
