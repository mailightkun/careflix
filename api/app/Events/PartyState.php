<?php

namespace App\Events;

use App\User;
use App\Party;
use Illuminate\Broadcasting\Channel;
use Illuminate\Queue\SerializesModels;
use Illuminate\Broadcasting\PrivateChannel;
// use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

class PartyState implements ShouldBroadcast
{
    use SerializesModels, InteractsWithSockets;

    /**
     * @var Party
     */
    public $party;

    /**
     * Create a new event instance.
     *
     * @return void
     */
    public function __construct(Party $party)
    {
        $this->party = $party;
    }

    /**
     * Get the channels the event should broadcast on.
     *
     * @return Channel|array
     */
    public function broadcastOn()
    {
        return new PrivateChannel('party.'.$this->party->id);
    }

    /**
     * The event's broadcast name.
     *
     * @return string
     */
    public function broadcastAs()
    {
        return 'state';
    }

    /**
     * Get the data to broadcast.
     *
     * @return array
     */
    public function broadcastWith()
    {
        return [
            'state' => [
                'is_playing' => $this->party->is_playing,
                'current_time' => $this->party->current_time
            ]
        ];
    }
}