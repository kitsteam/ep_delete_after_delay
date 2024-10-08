var delay;

function get_ttl(callback) {
    $.ajax({
        url: '../ttl/'+window.location.pathname.replace(/.*\/p\//, ''),
        method: 'GET',
        dataType: 'json',
        success: function(data, _textStatus, _jqXHR) {
            $('.ttl').remove();
            if (data.ttl === null) {
                delay = 1000;
            }
            if (data.ttl !== null && data.ttl > 0) {
                var text, ttl;
                if (data.ttl > 3600 * 24) {
                    text  = html10n.get('ep_delete_after_delay.days');
                    ttl   = data.ttl/(3600 * 24);
                    delay = 3500 * 1000;
                } else if (data.ttl > 3600) {
                    text  = html10n.get('ep_delete_after_delay.hours');
                    ttl   = data.ttl/3600;
                    delay = 1800 * 1000; // 30 minutes
                } else {
                    text  = html10n.get('ep_delete_after_delay.minutes');
                    ttl   = data.ttl/60;
                    delay = 600 * 1000 // 10 minutes
                }
                ttl  = Math.floor(ttl * 10)/10;
                text = text.replace(/XXXX/, ttl);
                $.gritter.add({
                    class_name: 'ttl',
                    title: html10n.get('ep_delete_after_delay.close'),
                    text: text+' '+ html10n.get('ep_delete_after_delay.suggest'),
                    sticky: true,
                    position: 'bottom'
                });
                $('#close_expiration_notif').click(function() {
                    $(this).parents('.gritter-item').find('.gritter-close').click();
                });
            }
        },
        complete: function() {
            callback(delay);
        }
    });
}

function timeout_ttl(delay) {
    setTimeout(function() {
        get_ttl(timeout_ttl);
    }, delay);
}

exports.documentReady = function() {
    setTimeout(function() {
        get_ttl(timeout_ttl);
    }, 1000);
}
